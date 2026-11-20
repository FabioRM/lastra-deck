// @ts-check
'use strict';

const path = require('node:path');
const { createHash } = require('node:crypto');
const { readProcessPath } = require('./win32');
const { isAppId } = require('./app-mixer-pins');

const MAX_REVIEWED_SESSIONS = 24;
const digest = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const levelPercent = (scalar) => Number.isFinite(scalar) ? Math.round(scalar * 100) : null;

function sessionBinding(sessions) {
  if (!sessions.length || sessions.length > MAX_REVIEWED_SESSIONS
      || sessions.some(({ instance, scalar }) => !instance || !Number.isFinite(scalar) || scalar < 0 || scalar > 1)) return null;
  const items = sessions.map(({ instance, scalar }) => [instance, scalar]).sort(([a], [b]) => a.localeCompare(b, 'en'));
  if (new Set(items.map(([instance]) => instance)).size !== items.length) return null;
  return { identity: digest(items.map(([instance]) => instance)), revision: digest(items) };
}

function applySessionLevels(sessions, expected, level, allowed) {
  const checkpoint = sessions.map((entry) => ({ ...entry, scalar: entry.read() }));
  const binding = sessionBinding(checkpoint);
  if (!binding || binding.revision !== expected || !allowed()) throw new Error('The approved Windows audio sessions changed.');
  const assigned = level / 100;
  const attempted = [];
  try {
    for (const entry of checkpoint) {
      const observed = entry.read();
      if (!allowed() || observed !== entry.scalar) throw new Error('The approved Windows audio sessions changed.');
      if (levelPercent(observed) === level) continue;
      attempted.push(entry);
      entry.write(assigned);
      if (levelPercent(entry.read()) !== level) throw new Error('Windows did not verify an app session level.');
    }
    if (checkpoint.some((entry) => levelPercent(entry.read()) !== level)) {
      throw new Error('Windows did not verify the app session levels.');
    }
  } catch (error) {
    for (const entry of attempted.reverse()) {
      try {
        const observed = entry.read();
        if (Number.isFinite(observed) && Math.abs(observed - assigned) < 0.000001) entry.write(entry.scalar);
      } catch {
        // An expired session cannot be restored.
      }
    }
    throw error;
  }
}

function groupSessions(sessions, includeBinding = false) {
  const groups = new Map();
  for (const session of sessions) {
    const group = groups.get(session.id);
    if (group) group.push(session);
    else groups.set(session.id, [session]);
  }

  return [...groups.values()].map((group) => {
    const { id, name } = group[0];
    const muted = group.every((session) => session.muted);
    const binding = includeBinding ? sessionBinding(group) : null;
    return {
      id,
      name,
      count: group.length,
      canPin: group[0].canPin === true,
      active: group.some((session) => session.active),
      level: Math.round(group.reduce((sum, session) => sum + session.level, 0) / group.length),
      mixedLevel: group.some((session) => session.level !== group[0].level),
      muted,
      mixedMute: !muted && group.some((session) => session.muted),
      ...(binding ? { binding } : {}),
    };
  }).sort((a, b) => a.name.localeCompare(b.name, 'en') || a.id.localeCompare(b.id));
}

function createAudioSessions({ koffi, guid, call, check, withObject, eachOutput, free, activate, endpointId }) {
  const proto = (type, args) => koffi.proto('__stdcall', type, args);
  const getObject = proto('int32_t', ['void *', koffi.out('void **')]);
  const queryInterface = proto('int32_t', ['void *', 'void *', koffi.out('void **')]);
  const getItem = proto('int32_t', ['void *', 'int', koffi.out('void **')]);
  const getState = proto('int32_t', ['void *', koffi.out('int *')]);
  const getProcessId = proto('int32_t', ['void *', koffi.out('uint32_t *')]);
  const isSystem = proto('int32_t', ['void *']);
  const getVolume = proto('int32_t', ['void *', koffi.out('float *')]);
  const getMute = proto('int32_t', ['void *', koffi.out('int32_t *')]);
  const setVolume = proto('int32_t', ['void *', 'float', 'void *']);
  const setMute = proto('int32_t', ['void *', 'int32_t', 'void *']);
  const reference = proto('uint32_t', ['void *']);
  const managerType = guid('{77AA99A0-1BD6-484F-8BC7-2C654C9A9B6F}');
  const controlType = guid('{BFB7FF88-7239-4FC9-8FA2-07C950BE9C6D}');
  const volumeType = guid('{87CE5498-68D6-44E5-9215-6DA47EF883D8}');
  const meterType = guid('{C02216F6-8C67-4B5B-9D00-D008E73E0064}');
  const processPath = readProcessPath;

  function read(control, index, signature) {
    const out = [0];
    check(call(control, index, signature, out));
    return out[0];
  }

  function readString(control, index) {
    const out = [null];
    check(call(control, index, getObject, out));
    try {
      return out[0] ? koffi.decode.string16(out[0]) : '';
    } finally {
      free(out[0]);
    }
  }

  function identity(control, paths) {
    if (call(control, 15, isSystem) === 0) return { key: 'system', name: 'System sounds', canPin: true };

    const pid = read(control, 14, getProcessId);
    if (!paths.has(pid)) paths.set(pid, pid ? processPath(pid) : '');
    const executable = paths.get(pid);
    const fileName = path.win32.basename(executable).replace(/\.exe$/i, '');
    const displayName = readString(control, 4);
    const name = displayName && !displayName.startsWith('@') ? displayName
      : fileName || (pid ? 'Process ' + pid : 'Audio session');
    if (executable) return { key: 'exe:' + executable.toLowerCase(), name, canPin: true };
    if (pid) return { key: 'pid:' + pid, name };
    return { key: 'session:' + readString(control, 13), name };
  }

  function visitEndpointSessions(endpoint, visitor) {
    withObject(endpoint, 3, activate, (manager) => {
      withObject(manager, 5, getObject, (sessions) => {
        const count = read(sessions, 3, getState);
        for (let index = 0; index < count; index++) {
          try {
            withObject(sessions, 4, getItem, (session) => {
              const state = read(session, 3, getState);
              if (state !== 2) visitor(session, state); // AudioSessionStateExpired
            }, index);
          } catch (err) {
            // A session can expire while the list is being read.
            if (err.code !== 0x88890004 && err.code !== 0x80070490 && err.code !== 0x80004002) throw err;
          }
        }
      });
    }, managerType, 1, null);
  }

  function visitSessions(visitor, includeInstance = false) {
    const paths = new Map();
    eachOutput((endpoint) => {
      let device;
      if (includeInstance) {
        try { device = endpointId(endpoint); } catch {}
      }
      visitEndpointSessions(endpoint, (session, state) => {
        withObject(session, 0, queryInterface, (control) => {
          const { key, name, canPin } = identity(control, paths);
          const id = createHash('sha256').update(key).digest('hex');
          let identifier;
          if (device) {
            try { identifier = readString(control, 13); } catch {} // GetSessionInstanceIdentifier
          }
          withObject(session, 0, queryInterface, (volume) => {
            const scalar = read(volume, 4, getVolume);
            visitor({
              id, name, canPin, active: state === 1, level: levelPercent(scalar), muted: Boolean(read(volume, 6, getMute)),
              ...(includeInstance ? { instance: identifier ? digest([device, identifier]) : null, scalar } : {}),
            }, volume, control);
          }, volumeType);
        }, controlType);
      });
    });
  }

  function peak(endpoint) {
    let maximum = null;
    visitEndpointSessions(endpoint, (session, state) => {
      if (state !== 1) return;
      const audible = withObject(session, 0, queryInterface, (volume) =>
        !read(volume, 6, getMute) && read(volume, 4, getVolume) > 0, volumeType);
      if (!audible) return;
      const value = withObject(session, 0, queryInterface, (meter) => read(meter, 3, getVolume), meterType);
      if (Number.isFinite(value)) maximum = Math.max(maximum ?? 0, value);
    });
    return maximum;
  }

  function snapshot() {
    const sessions = [];
    visitSessions((session) => sessions.push(session));
    return groupSessions(sessions);
  }

  function controlSnapshot() {
    const sessions = [];
    visitSessions((session) => sessions.push(session), true);
    return groupSessions(sessions, true);
  }

  function setApprovedLevel(id, level, expected, allowed) {
    if (!isAppId(id) || !Number.isInteger(level) || level < 0 || level > 100) throw new Error('Choose a valid audio app and level.');
    const group = [];
    try {
      visitSessions((session, volume, control) => {
        if (session.id !== id) return;
        call(volume, 1, reference);
        call(control, 1, reference);
        group.push({
          instance: session.instance, volume, control,
          read: () => read(control, 3, getState) === 2 ? null : read(volume, 4, getVolume),
          write: (value) => check(call(volume, 3, setVolume, value, null)),
        });
      }, true);
      applySessionLevels(group, expected, level, allowed);
    } finally {
      for (const { volume, control } of group) {
        call(volume, 2, reference);
        call(control, 2, reference);
      }
    }
  }

  return {
    snapshot,
    controlSnapshot,
    setApprovedLevel,
    peak,
    change(id, level) {
      if (!isAppId(id)) throw new Error('Invalid audio app');
      if (level !== undefined && (!Number.isInteger(level) || level < 0 || level > 100)) {
        throw new Error('Volume must be an integer from 0 to 100');
      }

      const group = snapshot().find((app) => app.id === id);
      if (!group) throw new Error('The app closed its audio session');
      const muted = !group.muted;
      let count = 0;
      visitSessions((session, volume) => {
        if (session.id !== id) return;
        if (level === undefined) {
          check(call(volume, 5, setMute, Number(muted), null));
          if (Boolean(read(volume, 6, getMute)) !== muted) {
            throw new Error('Windows could not verify the mute state for ' + group.name);
          }
        } else {
          check(call(volume, 3, setVolume, level / 100, null));
          if (Math.round(read(volume, 4, getVolume) * 100) !== level) {
            throw new Error('Windows could not verify the volume for ' + group.name);
          }
        }
        count++;
      });
      if (!count) throw new Error('The app closed its audio session');
    },
  };
}

module.exports = { createAudioSessions, groupSessions, sessionBinding, applySessionLevels };
