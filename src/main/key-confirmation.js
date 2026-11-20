// @ts-check
'use strict';

const { randomUUID } = require('node:crypto');

class KeyConfirmation {
  #pending;

  begin(id, revision, foreground) {
    const token = randomUUID();
    this.#pending = { id, revision, foreground, token };
    return token;
  }

  consume(token, id, revision, foreground) {
    const pending = this.#pending;
    if (!pending || pending.token !== token) return false;
    this.clear();
    return pending.id === id && pending.revision === revision && pending.foreground === foreground;
  }

  cancel(token) {
    if (this.#pending && this.#pending.token === token) this.clear();
  }

  clear() {
    this.#pending = undefined;
  }
}

module.exports = { KeyConfirmation };
