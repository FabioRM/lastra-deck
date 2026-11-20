// @ts-check
'use strict';

const review = require('../../profiles/codex-shortcuts.json');
const { createReferenceApplication } = require('./shortcut-catalog-reference');

const codexApplications = [
  createReferenceApplication(review, {
    id: 'codex-cli', name: 'Codex CLI', edition: 'Interactive terminal',
    availability: 'Requires verification of the active Codex session, terminal keymap, and context.',
    groups: [{ rows: 'tui', source: 'cli-defaults' },
      { rows: 'slash', source: 'cli-slash', commands: 'slash' }],
  }),
];

module.exports = { codexApplications };
