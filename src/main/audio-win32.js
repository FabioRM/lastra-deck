// @ts-check
'use strict';

const { setTimeout: wait } = require('node:timers/promises');
const { createAudioSessions } = require('./audio-sessions-win32');
const { loadWin32, fn, comCall } = require('./win32');

// The microphone level defaults to the communications device. Global mute
// also covers capture devices selected directly by individual apps.
const DEVICES = { output: 0, microphone: 1 };
const ROLE_CONSOLE = 0;
const ROLE_MULTIMEDIA = 1;
const ROLE_COMMUNICATIONS = 2;
const PLAYBACK_ROLES = [ROLE_CONSOLE, ROLE_MULTIMEDIA];
const DEVICE_STATE_ACTIVE = 1;
const DEVICE_STATE_DISABLED = 2;
const DEVICE_STATE_NOTPRESENT = 4;
const DEVICE_STATE_UNPLUGGED = 8;
const ALL_DEVICE_STATES = DEVICE_STATE_ACTIVE | DEVICE_STATE_DISABLED | DEVICE_STATE_NOTPRESENT | DEVICE_STATE_UNPLUGGED;
const CLSCTX_INPROC_SERVER = 1;
const ENDPOINT_NOT_FOUND = 0x80070490;
const MUTE_CHECK_INTERVAL_MS = 40;
const MUTE_CHECK_ATTEMPTS = 20;

function microphonePeak(inputs, inputId, read) {
  let peak = null;
  let source = inputId ?? null;
  for (const input of inputs) {
    if (input.muted !== false || (inputId != null && input.id !== inputId)) continue;
    const value = read(input);
    if (Number.isFinite(value) && (peak === null || value > peak)) {
      peak = value;
      source = input.id;
    }
  }
  return { microphone: peak, microphoneId: source };
}

function verifiedPeak(id, readState, readSignal) {
  const unavailable = { id, status: 'unavailable', value: null };
  try {
    const before = readState();
    if (before?.id !== id || typeof before.muted !== 'boolean') return unavailable;
    if (before.muted) return { ...unavailable, status: 'muted' };
    const value = readSignal(before);
    const after = readState();
    if (after?.id !== id || typeof after.muted !== 'boolean') return unavailable;
    if (after.muted) return { ...unavailable, status: 'muted' };
    return Number.isFinite(value) && value >= 0 && value <= 1 ? { id, status: 'live', value } : unavailable;
  } catch {
    return unavailable;
  }
}

async function changeDefaultPlayback(id, devices, { getDefault, setDefault, settle = wait, expected, canContinue = () => true }) {
  if (typeof id !== 'string' || !devices.some((device) => device.id === id && device.state === 'active')) {
    throw new Error('The selected playback device is unavailable');
  }

  const previous = new Map(PLAYBACK_ROLES.map((role) => [role, getDefault(role)]));
  if (expected && PLAYBACK_ROLES.some((role, index) => previous.get(role) !== expected[index])) {
    throw new Error('The reviewed playback routing changed');
  }
  const verify = () => { if (!canContinue()) throw new Error('The playback review ended'); };
  const requested = [];
  try {
    for (const [role, formerId] of previous) {
      verify();
      if (formerId === id) continue;
      setDefault(role, id);
      requested.push(role);
    }
    if (!requested.length) return;
    for (let attempt = 0; attempt <= 16; attempt++) {
      verify();
      if (PLAYBACK_ROLES.every((role) => getDefault(role) === id)) return;
      if (attempt < 16) await settle(50);
    }
    throw new Error('Windows could not verify the playback device switch');
  } catch (cause) {
    let restored = true;
    for (const role of requested.reverse()) {
      try {
        // Preserve a different default if Windows or another app changed it meanwhile.
        if (getDefault(role) !== id) continue;
        const formerId = previous.get(role);
        if (!formerId) restored = false;
        else setDefault(role, formerId);
      } catch {
        restored = false;
      }
    }
    if (!restored) throw new Error(cause.message + '. Windows could not restore the previous default.', { cause });
    throw cause;
  }
}

async function toggleMicrophones(inputs, defaultId, mutedByLastra, setMuted, forceMute = false) {
  if (!inputs.length) throw new Error('Windows has no active microphones');
  const mute = forceMute || !inputs.every((input) => input.muted === true);
  const owned = inputs.filter((input) => mutedByLastra.has(input.id));
  const targets = mute ? inputs.filter((input) => input.muted !== true)
    : owned.length ? owned : inputs.filter((input) => input.id === defaultId).slice(0, 1);
  if (!targets.length && !forceMute) throw new Error('The default microphone is unavailable');

  const results = await Promise.all(targets.map(async (input) => {
    try {
      const changed = await setMuted(input.id, mute, () => {
        if (mute) mutedByLastra.add(input.id);
      });
      if (mute && changed) mutedByLastra.add(input.id);
      if (!mute) mutedByLastra.delete(input.id);
      return null;
    } catch {
      return input.name;
    }
  }));
  const failed = results.filter(Boolean);
  if (failed.length) {
    throw new Error('Windows could not verify the mute state for ' + failed.join(', '));
  }
  if (mute) return inputs.length === 1 ? 'Microphone muted' : inputs.length + ' microphones muted';
  return targets.length === 1 ? 'Microphone unmuted' : targets.length + ' microphones unmuted';
}

function createAudio() {
  if (process.platform !== 'win32') {
    return {
      read: () => ({ output: null, microphone: null, inputs: [] }),
      change: () => { throw new Error('Audio controls are available on Windows'); },
      listOutputs: () => ({ devices: [], defaultId: null }),
      setDefaultOutput: async () => { throw new Error('Playback device switching is available on Windows'); },
      listApps: () => [],
      listAppControls: () => [],
      changeApp: () => { throw new Error('Audio controls are available on Windows'); },
      readPeaks: () => ({ output: null, microphone: null }),
      readVerifiedPeaks: () => ({}),
      readCaptureInput: () => null,
      muteAllCapture: () => { throw new Error('Audio controls are available on Windows'); },
      close() {},
    };
  }

  const { koffi, types, pointerSize } = loadWin32();
  const init = fn('CoInitializeEx');
  const uninit = fn('CoUninitialize');
  const clsidFromString = fn('CLSIDFromString');
  const createInstance = fn('CoCreateInstance');
  const free = fn('CoTaskMemFree');
  const clearVariant = fn('PropVariantClear');
  const proto = (type, args) => koffi.proto('__stdcall', type, args);
  const { release, getProperty } = types;
  const getEndpoint = proto('int32_t', ['void *', 'int', 'int', koffi.out('void **')]);
  const enumEndpoints = proto('int32_t', ['void *', 'int', 'uint32_t', koffi.out('void **')]);
  const getDevice = proto('int32_t', ['void *', 'str16', koffi.out('void **')]);
  const getCount = proto('int32_t', ['void *', koffi.out('uint32_t *')]);
  const getItem = proto('int32_t', ['void *', 'uint32_t', koffi.out('void **')]);
  const getId = proto('int32_t', ['void *', koffi.out('void **')]);
  const getState = proto('int32_t', ['void *', koffi.out('uint32_t *')]);
  const activate = proto('int32_t', ['void *', 'void *', 'uint32_t', 'void *', koffi.out('void **')]);
  const getVolume = proto('int32_t', ['void *', koffi.out('float *')]);
  const setVolume = proto('int32_t', ['void *', 'float', 'void *']);
  const getMute = proto('int32_t', ['void *', koffi.out('int32_t *')]);
  const setMute = proto('int32_t', ['void *', 'int32_t', 'void *']);
  const setPolicyEndpoint = proto('int32_t', ['void *', 'str16', 'int']);
  const getPeak = proto('int32_t', ['void *', koffi.out('float *')]);

  function guid(value) {
    const bytes = Buffer.alloc(16);
    check(clsidFromString(value, bytes));
    return bytes;
  }

  function check(result) {
    if (result >= 0) return;
    const code = result >>> 0;
    const error = /** @type {Error & { code?: number }} */ (new Error('Core Audio (0x' + code.toString(16) + ')'));
    error.code = code;
    throw error;
  }

  const enumeratorClass = guid('{BCDE0395-E52F-467C-8E3D-C4579291692E}');
  const enumeratorType = guid('{A95664D2-9614-4F35-A746-DE8DB63617E6}');
  const policyClass = guid('{870AF99C-171D-4F9E-AF0D-E63DF40C2BC9}');
  const policyType = guid('{F8679F50-850A-41CF-9C72-430F290290C8}');
  const volumeType = guid('{5CDF2C82-841E-4546-9722-0CF74078229A}');
  const meterType = guid('{C02216F6-8C67-4B5B-9D00-D008E73E0064}');
  const friendlyName = Buffer.alloc(20);
  guid('{A45C254E-DF1C-4EFD-8020-67D146A850E0}').copy(friendlyName);
  friendlyName.writeUInt32LE(14, 16);
  const mutedByLastra = new Set();
  const meters = new Map();
  let outputEndpoint = null;
  let inputsById = new Map();
  const pendingMutes = new Set();
  let outputSwitchPending = false;

  const call = comCall;

  function openObject(instance, index, signature, ...args) {
    const out = [null];
    check(call(instance, index, signature, ...args, out));
    return out[0];
  }

  function withObject(instance, index, signature, operation, ...args) {
    const object = openObject(instance, index, signature, ...args);
    try {
      return operation(object);
    } finally {
      call(object, 2, release);
    }
  }

  let enumerator = null;
  let ownedApartment = false;
  function ensureEnumerator() {
    if (enumerator) return;
    const hr = init(null, 2); // COINIT_APARTMENTTHREADED
    if ((hr >>> 0) !== 0x80010106) check(hr); // Electron may have already initialized COM.
    ownedApartment = hr >= 0;
    try {
      const out = [null];
      check(createInstance(enumeratorClass, null, CLSCTX_INPROC_SERVER, enumeratorType, out));
      [enumerator] = out;
    } catch (err) {
      if (ownedApartment) uninit();
      ownedApartment = false;
      throw err;
    }
  }

  function withDefaultEndpoint(flow, role, operation) {
    ensureEnumerator();
    return withObject(enumerator, 4, getEndpoint, operation, flow, role);
  }

  function withVolume(endpoint, operation) {
    return withObject(endpoint, 3, activate, operation, volumeType, CLSCTX_INPROC_SERVER, null);
  }

  function withDeviceVolume(id, operation) {
    ensureEnumerator();
    return withObject(enumerator, 5, getDevice, (endpoint) => withVolume(endpoint, operation), id);
  }

  function endpointId(endpoint) {
    const out = [null];
    check(call(endpoint, 5, getId, out));
    try {
      return koffi.decode.string16(out[0]);
    } finally {
      free(out[0]);
    }
  }

  function endpointName(endpoint) {
    return withObject(endpoint, 4, getItem, (store) => {
      const property = Buffer.alloc(pointerSize === 8 ? 24 : 16);
      try {
        check(call(store, 5, getProperty, friendlyName, property));
        if (property.readUInt16LE() !== 31) return null; // VT_LPWSTR
        const pointer = pointerSize === 8 ? property.readBigUInt64LE(8) : BigInt(property.readUInt32LE(8));
        return pointer ? koffi.decode.string16(pointer) : null;
      } finally {
        clearVariant(property);
      }
    }, 0); // STGM_READ
  }

  function isMuted(volume) {
    const out = [0];
    check(call(volume, 15, getMute, out));
    return Boolean(out[0]);
  }

  async function verifiedMute(id, muted, onRequested) {
    const requested = withDeviceVolume(id, (volume) => {
      if (isMuted(volume) === muted) return false;
      const result = call(volume, 14, setMute, Number(muted), null);
      check(result);
      return result === 0; // S_OK means the endpoint accepted a change.
    });
    if (requested) onRequested?.();

    // Some drivers update their reported state asynchronously. Reopen the
    // endpoint on each check so COM references stay local to one synchronous call.
    for (let attempt = 0; attempt < MUTE_CHECK_ATTEMPTS; attempt++) {
      if (withDeviceVolume(id, isMuted) === muted) return requested;
      await wait(MUTE_CHECK_INTERVAL_MS);
    }
    throw new Error('Windows could not verify the device state');
  }

  function readVolume(volume) {
    const out = [0];
    check(call(volume, 9, getVolume, out));
    return { level: Math.round(out[0] * 100), muted: isMuted(volume) };
  }

  function readOutput() {
    outputEndpoint = null;
    try {
      return withDefaultEndpoint(DEVICES.output, ROLE_MULTIMEDIA, (endpoint) => {
        const state = withVolume(endpoint, readVolume);
        outputEndpoint = { id: endpointId(endpoint), ...state };
        return outputEndpoint;
      });
    } catch {
      return null;
    }
  }

  function releaseMeter(binding) {
    if (!binding?.meter) return;
    call(binding.meter, 2, release);
    binding.meter = null;
  }

  function pruneMeters(endpoints) {
    const active = new Set(endpoints.filter((endpoint) => endpoint?.muted === false).map(({ id }) => id));
    for (const [id, binding] of meters) {
      if (active.has(id)) continue;
      releaseMeter(binding);
      meters.delete(id);
    }
  }

  function readPeak(endpoint) {
    // Suppress the raw peak while muted. Endpoint metering may run before attenuation.
    const id = endpoint?.muted === false ? endpoint.id : undefined;
    if (!id) return null;
    if (!meters.has(id)) meters.set(id, { meter: null, retryAt: 0 });
    const binding = meters.get(id);
    if (Date.now() < binding.retryAt) return null;

    try {
      if (!binding.meter) {
        binding.meter = withObject(enumerator, 5, getDevice, (device) =>
          openObject(device, 3, activate, meterType, CLSCTX_INPROC_SERVER, null), id);
      }
      const out = [0];
      check(call(binding.meter, 3, getPeak, out));
      return Number.isFinite(out[0]) ? Math.min(1, Math.max(0, out[0])) : null;
    } catch {
      releaseMeter(binding);
      binding.retryAt = Date.now() + 1000;
      return null;
    }
  }

  function readSpeakerPeak(endpoint) {
    const peak = readPeak(endpoint);
    if (endpoint?.muted !== false || peak >= 0.001) return peak;
    // Some playback drivers leave their endpoint meter at its noise floor even
    // while a Windows audio session is playing. Use that endpoint's session meters.
    try {
      const sessionPeak = withObject(enumerator, 5, getDevice, sessions.peak, endpoint.id);
      return sessionPeak === null ? peak : Math.min(1, Math.max(peak ?? 0, sessionPeak));
    } catch {
      return peak;
    }
  }

  function eachEndpoint(flow, visit, mask = DEVICE_STATE_ACTIVE) {
    ensureEnumerator();
    withObject(enumerator, 3, enumEndpoints, (collection) => {
      const count = [0];
      check(call(collection, 3, getCount, count));
      for (let i = 0; i < count[0]; i++) {
        withObject(collection, 4, getItem, (endpoint) => visit(endpoint, i), i);
      }
    }, flow, mask);
  }

  function defaultPlaybackId(role) {
    try {
      return withDefaultEndpoint(DEVICES.output, role, endpointId);
    } catch (error) {
      if (error.code === ENDPOINT_NOT_FOUND) return null;
      throw error;
    }
  }

  function endpointState(endpoint) {
    const out = [0];
    check(call(endpoint, 6, getState, out));
    switch (out[0]) {
      case DEVICE_STATE_ACTIVE: return 'active';
      case DEVICE_STATE_DISABLED: return 'disabled';
      case DEVICE_STATE_NOTPRESENT:
      case DEVICE_STATE_UNPLUGGED: return 'disconnected';
      default: return 'unavailable';
    }
  }

  function listOutputs(mask = ALL_DEVICE_STATES) {
    const devices = [];
    eachEndpoint(DEVICES.output, (endpoint, index) => {
      let name = 'Playback device ' + (index + 1);
      let state = 'unavailable';
      try { name = endpointName(endpoint) || name; } catch {}
      try { state = endpointState(endpoint); } catch {}
      devices.push({ id: endpointId(endpoint), name, state });
    }, mask);
    const defaultId = defaultPlaybackId(ROLE_MULTIMEDIA);
    const rank = (device) => device.state !== 'active' ? 2 : device.id === defaultId ? 0 : 1;
    devices.sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));
    return { devices, defaultId: devices[0]?.state === 'active' && devices[0].id === defaultId ? defaultId : null };
  }

  function writePlaybackDefault(role, id) {
    const policy = [null];
    check(createInstance(policyClass, null, CLSCTX_INPROC_SERVER, policyType, policy));
    try {
      // SetDefaultEndpoint is slot 13 on IPolicyConfig, including IUnknown.
      check(call(policy[0], 13, setPolicyEndpoint, id, role));
    } finally {
      call(policy[0], 2, release);
    }
  }

  function readPlaybackRouting() {
    const { devices } = listOutputs(DEVICE_STATE_ACTIVE);
    return { devices, roles: PLAYBACK_ROLES.map(defaultPlaybackId) };
  }

  /**
   * @param {string} id
   * @param {{ expected?: any, canContinue?: () => boolean }} [options]
   */
  async function setDefaultOutput(id, { expected, canContinue } = {}) {
    if (outputSwitchPending || pendingMutes.has('output')) {
      throw new Error('A speaker change is already running');
    }
    outputSwitchPending = true;
    try {
      await changeDefaultPlayback(id, listOutputs(DEVICE_STATE_ACTIVE).devices, {
        getDefault: defaultPlaybackId,
        setDefault: writePlaybackDefault,
        expected,
        canContinue,
      });
    } finally {
      outputSwitchPending = false;
    }
  }

  const sessions = createAudioSessions({
    koffi, guid, call, check, withObject, free, activate, endpointId,
    eachOutput: (visit) => eachEndpoint(DEVICES.output, visit),
  });

  function readInputs() {
    const inputs = [];
    eachEndpoint(DEVICES.microphone, (endpoint, index) => {
      let name = 'Microphone ' + (index + 1);
      try { name = endpointName(endpoint) || name; } catch {}
      const id = endpointId(endpoint);
      try {
        inputs.push({ id, name, ...withVolume(endpoint, readVolume) });
      } catch {
        inputs.push({ id, name, level: null, muted: null });
      }
    });
    return inputs;
  }

  function preferredInput(inputs) {
    for (const role of [ROLE_COMMUNICATIONS, ROLE_MULTIMEDIA]) {
      try {
        const id = withDefaultEndpoint(DEVICES.microphone, role, endpointId);
        const endpoint = inputs.find((input) => input.id === id);
        if (endpoint) return endpoint;
      } catch {}
    }
    return inputs[0];
  }

  function readVerifiedPeaks({ outputId, inputId, requireDefaultInput = false }) {
    const result = {};
    if (outputId && outputEndpoint?.id === outputId) {
      const state = () => withDefaultEndpoint(DEVICES.output, ROLE_MULTIMEDIA, (endpoint) => {
        const id = endpointId(endpoint);
        return id === outputId && { id, muted: withVolume(endpoint, isMuted) };
      });
      result.output = verifiedPeak(outputId, state, readSpeakerPeak);
    }
    if (inputId && inputsById.has(inputId)) {
      const state = () => {
        if (requireDefaultInput) {
          let current;
          for (const role of [ROLE_COMMUNICATIONS, ROLE_MULTIMEDIA]) {
            try { current = withDefaultEndpoint(DEVICES.microphone, role, endpointId); break; } catch {}
          }
          if (current !== inputId) return null;
        }
        return withObject(enumerator, 5, getDevice, (endpoint) => endpointState(endpoint) === 'active'
          ? { id: endpointId(endpoint), muted: withVolume(endpoint, isMuted) } : null, inputId);
      };
      result.input = verifiedPeak(inputId, state, readPeak);
    }
    return result;
  }

  function changeMicrophone(level, inputId, forceMute = false) {
    const inputs = readInputs();

    if (level === undefined) {
      return toggleMicrophones(inputs, preferredInput(inputs)?.id, mutedByLastra, verifiedMute, forceMute);
    }

    const selectedId = inputId === undefined ? preferredInput(inputs)?.id : inputId;
    const targets = selectedId === null ? inputs : inputs.filter(({ id }) => id === selectedId);
    if (!targets.length) throw new Error('The selected microphone is unavailable');
    let failed = 0;
    for (const { id } of targets) {
      try {
        withDeviceVolume(id, (volume) => check(call(volume, 7, setVolume, level / 100, null)));
      } catch (error) {
        if (inputId !== null) throw error;
        failed++;
      }
    }
    if (failed) throw new Error(`Could not set the level on ${failed} of ${targets.length} microphones`);
    return null;
  }

  function toggleOutput() {
    const { id, muted } = withDefaultEndpoint(DEVICES.output, ROLE_MULTIMEDIA, (endpoint) => ({
      id: endpointId(endpoint), muted: withVolume(endpoint, isMuted),
    }));
    return verifiedMute(id, !muted).then(() => null);
  }

  async function changeMute(device, forceMute = false) {
    if (pendingMutes.has(device)) throw new Error('A mute change is already running');
    pendingMutes.add(device);
    try {
      return await (device === 'microphone' ? changeMicrophone(undefined, undefined, forceMute) : toggleOutput());
    } finally {
      pendingMutes.delete(device);
    }
  }

  function setEndpointMute(device, muted, id, before) {
    if (typeof id !== 'string' || typeof before !== 'boolean' || typeof muted !== 'boolean') throw new Error('Invalid endpoint mute request');
    if (pendingMutes.has(device) || (device === 'output' && outputSwitchPending)) throw new Error('Another audio change is in progress');
    const apply = (endpoint) => {
      if (endpointId(endpoint) !== id || endpointState(endpoint) !== 'active') throw new Error('The selected audio endpoint changed');
      return withVolume(endpoint, (volume) => {
        if (isMuted(volume) !== before) throw new Error('The audio mute state changed');
        if (muted !== before) check(call(volume, 14, setMute, Number(muted), null));
      });
    };
    if (device === 'output') return withDefaultEndpoint(DEVICES.output, ROLE_MULTIMEDIA, apply);
    if (device !== 'microphone' || !inputsById.has(id)) throw new Error('The selected microphone is unavailable');
    ensureEnumerator();
    withObject(enumerator, 5, getDevice, apply, id);
    mutedByLastra.delete(id);
  }

  return {
    listOutputs,
    readPlaybackRouting,
    setDefaultOutput,
    listApps: sessions.snapshot,
    listAppControls: sessions.controlSnapshot,
    setAppLevel: sessions.setApprovedLevel,
    changeApp: sessions.change,
    setEndpointMute,
    muteAllCapture: () => changeMute('microphone', true),
    readCaptureInput(inputId) {
      // Renderer input IDs may only refer to a recently enumerated capture endpoint.
      const input = inputsById.get(inputId);
      if (!input) return null;
      return { ...input, muted: withDeviceVolume(inputId, isMuted) };
    },
    readCaptureMute: (inputId) => withDeviceVolume(inputId, isMuted),
    readVerifiedPeaks,
    requestCaptureMute: (inputId, muted) => withDeviceVolume(inputId,
      (volume) => check(call(volume, 14, setMute, Number(muted), null))),
    readPeaks(inputId) {
      return {
        output: readSpeakerPeak(outputEndpoint),
        outputId: outputEndpoint?.id ?? null,
        ...microphonePeak(inputsById.values(), inputId, readPeak),
      };
    },
    read() {
      const output = readOutput();
      try {
        const inputs = readInputs();
        const primary = preferredInput(inputs);
        inputsById = new Map(inputs.map((input) => [input.id, input]));
        pruneMeters([output, ...inputs]);
        const mutedCount = inputs.filter((input) => input.muted === true).length;
        return {
          output,
          inputs,
          microphone: primary ? { ...primary, muted: mutedCount === inputs.length, mutedCount } : null,
        };
      } catch {
        inputsById.clear();
        pruneMeters([output]);
        return { output, microphone: null, inputs: [] };
      }
    },
    async change(device, level, inputId) {
      if (!Object.hasOwn(DEVICES, device)) throw new Error('Invalid audio device');
      if (device === 'output' && outputSwitchPending) throw new Error('Playback device switching is in progress');
      if (level !== undefined && (!Number.isInteger(level) || level < 0 || level > 100)) {
        throw new Error('Volume must be an integer from 0 to 100');
      }
      if (level === undefined) return changeMute(device);
      if (device === 'microphone') return changeMicrophone(level, inputId);
      withDefaultEndpoint(DEVICES.output, ROLE_MULTIMEDIA, (endpoint) => {
        if (inputId !== undefined && endpointId(endpoint) !== inputId) throw new Error('The default output changed.');
        return withVolume(endpoint, (volume) => check(call(volume, 7, setVolume, level / 100, null)));
      });
      return null;
    },
    close() {
      meters.forEach(releaseMeter);
      meters.clear();
      outputEndpoint = null;
      inputsById.clear();
      if (enumerator) call(enumerator, 2, release);
      if (ownedApartment) uninit();
      enumerator = null;
      ownedApartment = false;
    },
  };
}

module.exports = { createAudio, toggleMicrophones, changeDefaultPlayback, microphonePeak, verifiedPeak };
