// @ts-check
'use strict';

const { randomBytes } = require('node:crypto');

class ChoicePrompts {
  constructor(publish) { this.publish = publish; }

  ask({ prompt, options, timeoutMs }, verify) {
    if (this.active) return Promise.resolve({ message: 'Another macro is waiting for a choice.' });
    verify();
    return new Promise((resolve, reject) => {
      const token = randomBytes(12).toString('hex');
      const choices = options.map(({ id, label }) => ({ id, label }));
      this.active = {
        token, choices, verify, resolve, reject,
        timeout: setTimeout(() => this.finish({ message: 'The choice timed out.' }), timeoutMs).unref(),
        guard: setInterval(() => this.check(), 150).unref(),
      };
      this.publish({ token, prompt, choices });
    });
  }

  check() {
    if (!this.active) return false;
    try { this.active.verify(); }
    catch (error) { this.finish(undefined, error); return false; }
    return true;
  }

  answer(token, id) {
    if (this.active?.token !== token || !this.check()) return false;
    if (id !== null && !this.active.choices.some((option) => option.id === id)) return false;
    this.finish(id === null ? { cancelled: true, message: 'The choice was cancelled.' } : { id });
    return true;
  }

  finish(answer, error) {
    const active = this.active;
    if (!active) return;
    this.active = null;
    clearTimeout(active.timeout);
    clearInterval(active.guard);
    this.publish(null);
    if (error) active.reject(error);
    else active.resolve(answer);
  }
}

module.exports = { ChoicePrompts };
