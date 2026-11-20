// @ts-check
'use strict';

const { setTimeout: wait } = require('node:timers/promises');

const DEFAULT_POLICY = {
  leaseMs: 1000,
  maxHoldMs: 30_000,
  checkMs: 40,
  attempts: 20,
  retryMs: 500,
};

class PushToTalk {
  /**
   * @param {any} audio
   * @param {{ publish?: (view: any) => void, now?: () => number, sleep?: (ms: number) => Promise<unknown>,
   *   policy?: Partial<typeof DEFAULT_POLICY>, startGuard?: (inputId: string, onLost: () => void) => any }} [options]
   */
  constructor(audio, { publish = () => {}, now = () => performance.now(), sleep = wait, policy = {}, startGuard } = {}) {
    this.audio = audio;
    this.publish = publish;
    this.now = now;
    this.sleep = sleep;
    this.startGuard = startGuard;
    this.policy = { ...DEFAULT_POLICY, ...policy };
    this.view = { phase: 'idle' };
    this.lease = null;
    this.toggling = false;
    this.disposed = false;
  }

  start(owner, token, inputId) {
    if (typeof token !== 'string' || !token || token.length > 64
        || typeof inputId !== 'string' || !inputId || inputId.length > 512) {
      throw new Error('Invalid push-to-talk request');
    }
    if (this.disposed || this.lease || this.toggling) throw new Error('The microphone is busy');

    const microphone = this.audio.readCaptureInput(inputId);
    if (!microphone) throw new Error('The selected microphone is unavailable');
    if (microphone.muted !== true) throw new Error('Mute the selected microphone before holding to talk');

    const time = this.now();
    const lease = this.lease = {
      owner, token, inputId, phase: 'opening', closing: null,
      unmuteRequested: false, openConfirmed: false,
      deadline: time + Math.min(this.policy.leaseMs, this.policy.maxHoldMs),
      maximum: time + this.policy.maxHoldMs,
    };
    this.show(lease);
    this.watch(lease);
    void this.open(lease);
  }

  renew(owner, token) {
    const lease = this.lease;
    if (!lease || lease.owner !== owner || lease.token !== token
        || (lease.phase !== 'opening' && lease.phase !== 'talking')) return;
    const time = this.now();
    if (time >= lease.deadline) {
      this.expire(lease);
      return;
    }
    lease.deadline = Math.min(time + this.policy.leaseMs, lease.maximum);
    this.watch(lease);
  }

  stop(owner, token) {
    const lease = this.lease;
    if (lease && lease.owner === owner && lease.token === token) return this.close(lease);
  }

  cancel(owner) {
    const lease = this.lease;
    if (lease && (owner === undefined || lease.owner === owner)) return this.close(lease);
    return Promise.resolve(true);
  }

  observeInputs(inputs) {
    const lease = this.lease;
    if (!lease || (lease.phase !== 'opening' && lease.phase !== 'talking')) return;
    const input = inputs.find(({ id }) => id === lease.inputId);
    if (!input || (lease.phase === 'talking' && input.muted !== false)) void this.close(lease);
  }

  async toggleMicrophones() {
    if (this.toggling || this.disposed) throw new Error('A microphone change is already running');
    this.toggling = true;
    try {
      if (!this.lease) return await this.audio.change('microphone');
      await this.close(this.lease);
      return await this.audio.muteAllCapture();
    } finally {
      this.toggling = false;
    }
  }

  async dispose() {
    this.disposed = true;
    const confirmed = await this.cancel();
    clearTimeout(this.timer);
    return confirmed;
  }

  show(lease, message = '') {
    this.view = { phase: lease.phase, token: lease.token, inputId: lease.inputId, message };
    this.publish(this.view);
  }

  watch(lease) {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      if (lease !== this.lease) return;
      if (this.now() >= lease.deadline) this.expire(lease);
      else this.watch(lease);
    }, Math.max(1, lease.deadline - this.now()));
    this.timer.unref?.();
  }

  expire(lease) {
    const message = lease.deadline === lease.maximum ? 'Talk limit reached' : 'Push-to-talk was interrupted';
    void this.close(lease, message);
  }

  async open(lease) {
    try {
      if (lease.phase !== 'opening') return;
      if (this.startGuard) {
        lease.guard = this.startGuard(lease.inputId, () => void this.close(lease, 'The microphone guard disconnected'));
        await lease.guard.ready;
        if (lease.phase !== 'opening') return;
        if (!lease.guard.available || this.audio.readCaptureMute(lease.inputId) !== true) {
          throw new Error('The microphone guard is unavailable');
        }
        if (this.now() >= lease.deadline) {
          this.expire(lease);
          return;
        }
      }
      lease.unmuteRequested = true;
      this.audio.requestCaptureMute(lease.inputId, false);
      for (let attempt = 0; attempt < this.policy.attempts; attempt++) {
        if (lease.phase !== 'opening') return;
        if (this.now() >= lease.deadline) {
          this.expire(lease);
          return;
        }
        if (this.audio.readCaptureMute(lease.inputId) === false) {
          lease.openConfirmed = true;
          lease.phase = 'talking';
          this.show(lease);
          return;
        }
        await this.sleep(this.policy.checkMs);
      }
    } catch {
      // A device can disappear or reject the request after the write was issued.
    }
    if (lease.phase === 'opening') {
      const message = lease.unmuteRequested
        ? 'Windows could not confirm the microphone opened' : 'The microphone guard could not start';
      void this.close(lease, message);
    }
  }

  close(lease, message = '') {
    if (this.lease !== lease) return Promise.resolve(true);
    if (lease.closing) return lease.closing;
    clearTimeout(this.timer);
    if (lease.phase !== 'fault') {
      lease.phase = 'closing';
      this.show(lease, message);
    }
    const settle = lease.unmuteRequested && !lease.openConfirmed;
    lease.closing = this.verifyMute(lease.inputId, settle).then((confirmed) => {
      lease.closing = null;
      if (confirmed) {
        lease.guard?.disarm();
        this.lease = null;
        this.view = { phase: 'idle', token: lease.token, message };
        this.publish(this.view);
      } else {
        if (lease.phase !== 'fault') {
          lease.phase = 'fault';
          this.show(lease, 'Windows could not confirm the microphone was muted. Check its mute in Windows.');
        }
        if (!this.disposed) {
          this.timer = setTimeout(() => void this.close(lease), this.policy.retryMs);
          this.timer.unref?.();
        }
      }
      return confirmed;
    });
    return lease.closing;
  }

  async verifyMute(inputId, settle) {
    let stable = 0;
    for (let attempt = 0; attempt < this.policy.attempts; attempt++) {
      // Force the write even if the old muted state is still visible while
      // a preceding unmute request is propagating through the driver.
      try {
        if (!stable) this.audio.requestCaptureMute(inputId, true);
      } catch {
        // Retry after a transient driver or device error.
      }
      await this.sleep(this.policy.checkMs);
      try {
        stable = this.audio.readCaptureMute(inputId) === true ? stable + 1 : 0;
        // A driver may show the original mute state until a queued unmute
        // appears. Allow the full settle window after an interrupted opening.
        if (stable >= 2 && (!settle || attempt === this.policy.attempts - 1)) return true;
      } catch {
        stable = 0;
      }
    }
    return false;
  }
}

module.exports = { PushToTalk };
