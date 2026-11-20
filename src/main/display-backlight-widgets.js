// @ts-check
'use strict';

const { BUSY, STALE } = require('./display-backlight');

const OWNER_ID = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/;

class DisplayBacklightWidgets {
  constructor(backlight) { this.backlight = backlight; }

  async request(command) {
    if (command?.type === 'read') return this.backlight.read('widgets');
    if (typeof command?.owner !== 'string' || !OWNER_ID.test(command.owner)) return STALE;
    if (command.type === 'cancel') {
      if (this.pending?.owner === command.owner) this.pending.cancelled = true;
      return { ok: true };
    }
    if (command.type !== 'apply') return STALE;
    if (this.pending) return BUSY;
    const operation = { owner: command.owner, cancelled: false };
    this.pending = operation;
    try {
      return await this.backlight.change(command.token, command.percent, {
        scope: 'widgets', allowed: () => !operation.cancelled,
      });
    } finally {
      this.pending = null;
    }
  }
}

module.exports = { DisplayBacklightWidgets };
