// @ts-check
'use strict';

const { createHash } = require('node:crypto');
const { ACTIVITIES, knownActivity } = require('./activity-profiles');
const { readJsonSettings } = require('./json-settings-file');
const { writeAtomic } = require('./write-atomic');
const { confirmState } = require('./confirm-state');

const CHANNELS = ['output', 'microphone'];
const LABELS = { output: 'Speakers', microphone: 'Microphone' };
const endpoint = (item, device) => typeof item?.id === 'string' && item.id.length > 0 && item.id.length <= 512
  && Number.isInteger(item.level) && item.level >= 0 && item.level <= 100 ? {
    id: item.id, level: item.level, name: typeof item.name === 'string'
      ? item.name.replace(/[\p{Cc}\p{Cf}]/gu, '').slice(0, 100) || LABELS[device] : LABELS[device],
  } : null;

function readPresets(file, log) {
  return readJsonSettings(file, {
    maxBytes: 9600,
    parse(value) {
      if (value?.version !== 1) throw new Error('Unknown audio presets format');
      return Object.fromEntries(Object.keys(ACTIVITIES).flatMap((id) => {
        const channels = Object.fromEntries(CHANNELS.flatMap((device) => {
          const item = endpoint(value.presets?.[id]?.[device], device);
          return item ? [[device, item]] : [];
        }));
        return Object.keys(channels).length ? [[id, channels]] : [];
      }));
    },
    fallback: () => ({}),
    onError: () => log('Could not read Windows audio presets.'),
  });
}

class AudioPresets {
  /**
   * @param {string} file
   * @param {{ read?: () => any, write?: (device: any, level: any, id: string) => Promise<any>, currentGuard?: () => any,
   *   log?: (...args: any[]) => void, confirmation?: any }} [options]
   */
  constructor(file, { read, write, currentGuard, log = () => {}, confirmation } = {}) {
    this.file = file;
    this.read = read;
    this.write = write;
    this.currentGuard = currentGuard;
    this.confirmation = confirmation;
    this.presets = readPresets(file, log);
  }

  state() {
    const state = this.read();
    return Object.fromEntries(CHANNELS.map((device) => [device, endpoint(state?.[device], device)]));
  }

  review(id, current) {
    const saved = this.presets[id];
    const planned = Object.entries(saved ?? {}).map(([device, target]) => {
      const live = current[device];
      return { device, label: LABELS[device], name: target.name, saved: target.level, current: live?.id === target.id ? live.level : null,
        available: live?.id === target.id, id: target.id };
    });
    const token = planned.length && planned.every(({ available }) => available)
      ? createHash('sha256').update(JSON.stringify([id, planned])).digest('hex').slice(0, 24) : null;
    return { planned, token };
  }

  snapshot() {
    const current = this.state();
    return { canCapture: Boolean(current.output || current.microphone), presets: Object.entries(ACTIVITIES).map(([id, name]) => {
      const { planned, token } = this.review(id, current);
      return { id, name, token, channels: planned.map(({ id: endpointId, ...channel }) => channel) };
    }) };
  }

  /** @param {{ action?: string, preset?: string, token?: any }} [command] */
  async change({ action, preset, token } = {}) {
    if (!knownActivity(preset)) throw new Error('Choose a Windows audio preset.');
    if (this.running) throw new Error('An audio preset is already applying.');
    const guard = this.currentGuard();
    const blocked = guard();
    if (blocked) throw new Error(blocked);
    const state = this.state();
    if (action === 'capture') {
      const selected = Object.fromEntries(Object.entries(state).filter(([, channel]) => channel));
      if (!Object.keys(selected).length) throw new Error('Windows has no audio levels to save.');
      const next = { ...this.presets, [preset]: selected };
      writeAtomic(this.file, JSON.stringify({ version: 1, presets: next }, null, 2) + '\n');
      this.presets = next;
      return { ok: true, message: 'Audio levels saved.' };
    }
    if (action !== 'apply') throw new Error('Choose a registered audio preset operation.');
    const review = this.review(preset, state);
    if (!review.token || review.token !== token) throw new Error('The audio device or level changed. Review the preset again.');
    this.running = true;
    let confirmed = 0;
    try {
      for (const { device, id, current, saved } of review.planned) {
        const reason = guard();
        if (reason) throw new Error(reason);
        const observed = this.state()[device];
        if (observed?.id !== id || observed.level !== current) throw new Error('The approved audio device or level changed.');
        if (saved !== current) await this.write(device, saved, id);
        await confirmState(() => {
          const blocked = guard();
          if (blocked) throw new Error(blocked);
          const readback = this.state()[device];
          if (readback?.id !== id) throw new Error('The audio device changed during readback.');
          return readback.level === saved;
        }, 'Windows did not confirm the preset level.', this.confirmation);
        confirmed++;
      }
      return { ok: true, message: 'Audio preset applied.' };
    } catch (error) {
      return { ok: false, message: confirmed ? `${confirmed} of ${review.planned.length} levels confirmed · ${error.message}` : error.message };
    } finally { this.running = false; }
  }
}

module.exports = { AudioPresets };
