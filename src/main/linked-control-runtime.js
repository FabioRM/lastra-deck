// @ts-check
'use strict';

const { KeyPresses, IGNORED } = require('./key-presses');
const { obsSceneState, sceneTarget } = require('../shared/linked-controls');

const queueKey = (scope, id) => JSON.stringify(['linked-control', scope, id]);

class LinkedControlRuntime {
  constructor(publish, presses = new KeyPresses()) {
    this.publish = publish;
    this.presses = presses;
    this.pending = new Map();
  }

  snapshot(scope = '') {
    return Object.fromEntries(this.pending.get(scope) ?? []);
  }

  async run(id, policy, execute, scope = '') {
    const pending = this.pending.get(scope) ?? new Map();
    const previous = pending.get(id) ?? 0;
    if (previous && (policy !== 'queue-one' || previous >= 2)) return IGNORED;
    this.pending.set(scope, pending);
    pending.set(id, previous + 1);
    try {
      this.publish(scope, this.snapshot(scope));
      return await this.presses.run(queueKey(scope, id), policy, execute);
    } finally {
      const remaining = pending.get(id) - 1;
      if (remaining) pending.set(id, remaining);
      else pending.delete(id);
      if (!pending.size) this.pending.delete(scope);
      this.publish(scope, this.snapshot(scope));
    }
  }

  cancelPending(id, scope) { this.presses.cancelPending(queueKey(scope, id)); }
}

async function changeObsScene(obs, action) {
  const target = sceneTarget(action);
  const view = obs?.view;
  const { unavailable, pressed } = obsSceneState(view, target);
  if (unavailable) return { ok: false, message: unavailable, unavailable: true };
  if (pressed) return { ok: true, message: 'OBS scene is already active.' };
  return obs.change({ type: 'scene', value: target.scene, studio: target.bus === 'preview', generation: view.generation });
}

module.exports = { LinkedControlRuntime, changeObsScene };
