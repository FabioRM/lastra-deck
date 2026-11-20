'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { buildAudit, normalizedChord, REPORTS, run } = require('../scripts/shortcut-audit');

let DatabaseSync;
try { ({ DatabaseSync } = require('node:sqlite')); } catch {}

function item(id, overrides = {}, app = 'fixture') {
  return { id, app: { id: app, name: 'Fixture editor' }, platforms: ['windows'],
    source: { sourceId: 'manual', url: 'https://example.test/keyboard', revision: '2026-02' }, binding: {
      actionId: id, chord: 'Ctrl+Shift+S', notation: 'Ctrl+Shift+S', platform: 'windows', hostPlatform: 'windows',
      contexts: ['Workspace', 'Editor'], mode: 'Editing', edition: 'Desktop', appVersion: '4.0', layout: 'US',
      language: 'en-US', when: 'editorFocus', verification: { status: 'documented' }, ...overrides,
    } };
}

test('Windows binding normalization keeps chord sequence and separates virtual and character keys', () => {
  assert.equal(normalizedChord({ chord: 'Control+Shift+Esc' }, 'windows'), normalizedChord({ chord: 'SHIFT+Escape+Ctrl' }, 'windows'));
  assert.notEqual(normalizedChord({ chord: 'Ctrl+S' }, 'windows'), normalizedChord({ chord: 'Ctrl+char:s' }, 'windows'));
  assert.notEqual(normalizedChord({ orderedChords: ['Ctrl+K', 'S'] }, 'windows'),
    normalizedChord({ orderedChords: ['S', 'Ctrl+K'] }, 'windows'));
  assert.equal(normalizedChord({ kind: 'shortcut', notation: 'Ctrl+K then S' }, 'windows'),
    normalizedChord({ orderedChords: ['Ctrl+K', 'S'] }, 'windows'));
  assert.equal(normalizedChord({ kind: 'gesture', notation: 'Ctrl+S' }, 'windows'), null);
  assert.equal(normalizedChord({ chord: 'AltGr+Q' }, 'windows'), null);
  assert.equal(normalizedChord({ chord: 'Ctrl+S' }, 'macos'), null);
});

test('audit generates typed and owned rows and rolls back a duplicate inventory', { skip: !DatabaseSync }, (t) => {
  const db = new DatabaseSync(':memory:');
  t.after(() => db.close());
  assert.throws(() => buildAudit(db, [item('save'), item('save')]), /UNIQUE constraint/);
  assert.equal(db.prepare('SELECT count(*) AS rows FROM binding').get().rows, 0);
  db.exec("INSERT INTO application VALUES ('one','First'), ('two','Second')");
  db.exec("INSERT INTO context VALUES ('one','[\"Editor\"]')");
  assert.throws(() => db.exec("INSERT INTO context VALUES ('one','[1]')"), /string context names/);
  const put = db.prepare(`INSERT INTO binding VALUES (${Array(21).fill('?').join(',')})`);
  const values = ['binding', 'two', '["Editor"]', 'save', 'shortcut', 'windows', 'windows', '', '', '', '', 12345, '', '', '', '', null, '', '', '', 'documented'];
  assert.throws(() => put.run(...values), /FOREIGN KEY/);
  values[1] = 'one';
  values[11] = 'not a build';
  assert.throws(() => put.run(...values), /INTEGER/);
});

test('overlap report compares only equivalent bindings in the same documented scope', { skip: !DatabaseSync }, (t) => {
  const db = new DatabaseSync(':memory:');
  t.after(() => db.close());
  buildAudit(db, [item('save'), item('other-save', { chord: 'Shift+Control+S', contexts: ['EDITOR', 'workspace'] }),
    item('another-app', {}, 'separate-app'), item('another-command-mode', { mode: 'Preview' }),
    item('another-layout', { layout: 'IT' }), item('another-condition', { when: 'terminalFocus' }),
    item('another-context', { contexts: ['Terminal'] }), item('another-version', { appVersion: '4.1' }),
    item('another-trigger', { trigger: 'Hold' }), item('same-command', { actionId: 'save' }),
  ]);
  const rows = db.prepare(REPORTS.overlaps.sql).all(null, null);
  assert.deepEqual(rows.map(({ first_action, second_action }) => [first_action, second_action]), [['other-save', 'save']]);
  assert.ok(db.prepare(REPORTS.provenance.sql).all('fixture', 'fixture').some(({ source_id }) => source_id === 'manual'));
});

test('audit reports retain CSV column headers and use the bundled stock catalog', { skip: !DatabaseSync }, () => {
  assert.match(run(['--help']), /coverage\|provenance\|versions\|overlaps/);
  const json = JSON.parse(run(['--report', 'coverage', '--app', 'blender']));
  assert.ok(json.rows.some(({ references, normalized }) => references > 0 && normalized > 0));
  assert.equal(run(['--report', 'versions', '--app', 'absent-test-scope', '--format', 'csv']), REPORTS.versions.columns.join(',') + '\n');
});
