// @ts-check
'use strict';

const { parseArgs } = require('node:util');
const { searchCatalog } = require('../src/main/mcp-catalog-search');
const { catalog } = require('../src/main/shortcut-catalog');
const { parseCombo } = require('../src/main/actions/keys');

const REPORTS = {
  coverage: {
    columns: ['app', 'name', 'platform', 'references', 'unassigned', 'inventory', 'normalized'],
    sql: `SELECT a.id AS app, a.name, b.platform, count(*) AS "references",
      sum(b.kind = 'unassigned') AS unassigned, sum(b.kind = 'inventory') AS inventory,
      sum(b.normalized IS NOT NULL) AS normalized
      FROM binding b JOIN application a ON a.id = b.app
      WHERE (? IS NULL OR a.id = ?) GROUP BY a.id, b.platform ORDER BY a.id, b.platform`,
  },
  provenance: {
    columns: ['app', 'source_id', 'source_url', 'source_revision', 'verification', 'references'],
    sql: `SELECT app, source_id, source_url, source_revision, verification, count(*) AS "references"
      FROM binding WHERE (? IS NULL OR app = ?)
      GROUP BY app, source_id, source_url, source_revision, verification
      ORDER BY app, source_id, source_url, source_revision, verification`,
  },
  versions: {
    columns: ['app', 'platform', 'host', 'edition', 'version', 'keyboard_layout', 'shortcut_language', 'windows_build', 'references'],
    sql: `SELECT app, platform, host, edition, version, keyboard_layout, shortcut_language, windows_build, count(*) AS "references"
      FROM binding WHERE (? IS NULL OR app = ?)
      GROUP BY app, platform, host, edition, version, keyboard_layout, shortcut_language, windows_build
      ORDER BY app, platform, host, edition, version, keyboard_layout, shortcut_language, windows_build`,
  },
  overlaps: {
    columns: ['app', 'platform', 'contexts', 'first_action', 'second_action', 'first_chord', 'second_chord', 'mode', 'edition', 'version', 'keyboard_layout'],
    sql: `SELECT a.app, a.platform, a.contexts, a.action AS first_action, b.action AS second_action, a.notation AS first_chord,
      b.notation AS second_chord, a.mode, a.edition, a.version, a.keyboard_layout
      FROM binding a JOIN binding b ON a.app = b.app AND a.platform = b.platform AND a.normalized = b.normalized
      AND a.contexts = b.contexts AND a.host = b.host AND a.edition = b.edition AND a.version = b.version
      AND a.keyboard_layout = b.keyboard_layout AND a.shortcut_language = b.shortcut_language
      AND a.windows_build IS b.windows_build AND a.mode = b.mode AND a.condition = b.condition AND a.trigger = b.trigger
      AND a.action < b.action
      WHERE (? IS NULL OR a.app = ?)
      GROUP BY a.app, a.platform, a.contexts, a.action, b.action, a.notation, b.notation, a.mode, a.edition, a.version, a.keyboard_layout
      ORDER BY a.app, a.platform, a.contexts, a.action, b.action, a.notation, b.notation`,
  },
};

const DDL = `
  CREATE TABLE application (
    id TEXT PRIMARY KEY CHECK (length(id) > 0), name TEXT NOT NULL
  ) STRICT;
  CREATE TABLE context (
    app TEXT NOT NULL REFERENCES application(id), contexts TEXT NOT NULL CHECK (json_type(contexts) = 'array'),
    PRIMARY KEY (app, contexts)
  ) STRICT;
  CREATE TRIGGER context_tokens BEFORE INSERT ON context
    WHEN EXISTS (SELECT 1 FROM json_each(NEW.contexts) WHERE type != 'text')
    BEGIN SELECT RAISE(ABORT, 'Use string context names'); END;
  CREATE TABLE binding (
    id TEXT PRIMARY KEY CHECK (length(id) > 0), app TEXT NOT NULL, contexts TEXT NOT NULL, action TEXT NOT NULL,
    kind TEXT NOT NULL, platform TEXT NOT NULL, host TEXT NOT NULL, edition TEXT NOT NULL, version TEXT NOT NULL,
    keyboard_layout TEXT NOT NULL, shortcut_language TEXT NOT NULL, windows_build INTEGER CHECK (windows_build >= 0),
    mode TEXT NOT NULL, condition TEXT NOT NULL, trigger TEXT NOT NULL, notation TEXT NOT NULL, normalized TEXT,
    source_id TEXT NOT NULL, source_url TEXT NOT NULL, source_revision TEXT NOT NULL, verification TEXT NOT NULL,
    FOREIGN KEY (app, contexts) REFERENCES context(app, contexts)
  ) STRICT;
  CREATE INDEX scope_lookup ON binding (app, platform, normalized, contexts) WHERE normalized IS NOT NULL;
`;

const scopeValue = (value) => typeof value === 'string' ? value.trim().toLowerCase() : '';

function normalizedChord(binding, platform) {
  if (!binding || (platform !== 'windows' && binding.hostPlatform !== 'windows')) return null;
  const ordinary = binding.kind === 'shortcut' && typeof binding.notation === 'string' ? binding.notation.split(/\s+then\s+/i) : [];
  const chords = binding.orderedChords?.length ? binding.orderedChords : binding.chord ? [binding.chord] : ordinary;
  if (!chords.length) return null;
  try {
    return JSON.stringify(chords.map((chord) => parseCombo(chord).map(({ vk, extended, scan, character }) =>
      vk !== undefined ? `vk:${vk}` : scan !== undefined ? `scan:${extended ? 'e0' : ''}${scan}` : `char:${character}`).sort()));
  } catch { return null; }
}

function bindingRow(item) {
  const { app, source, binding } = item;
  const platform = binding?.platform ?? item.platforms[0] ?? 'reference';
  const contexts = JSON.stringify([...new Set((binding?.contexts ?? []).map(scopeValue).filter(Boolean))].sort());
  const scope = [platform, binding?.hostPlatform, binding?.edition, binding?.appVersion, binding?.layout, binding?.language].map(scopeValue);
  const trigger = binding?.trigger?.trim();
  const ordinaryPress = trigger === `Press ${binding?.notation}.`;
  return [item.id, app.id, contexts, binding?.actionId ?? item.id, binding?.kind ?? (binding ? 'shortcut' : 'inventory'),
    ...scope, binding?.windowsBuild ?? null, scopeValue(binding?.mode), binding?.when?.trim() ?? '', ordinaryPress ? '' : trigger ?? '',
    binding?.notation ?? binding?.chord ?? '', normalizedChord(binding, platform), source.sourceId ?? '', source.url ?? '',
    source.revision ?? '', binding?.verification?.status ?? 'inventory'];
}

function* catalogItems(language) {
  const options = { kind: 'shortcut', shortcutLanguage: language, limit: 40 };
  let cursor;
  do {
    const result = searchCatalog({ ...options, ...(cursor ? { cursor } : {}) }, { platform: 'windows', osRelease: '' });
    yield* result.items;
    cursor = result.nextCursor;
  } while (cursor);
}

function buildAudit(db, items) {
  db.exec('PRAGMA foreign_keys = ON');
  db.exec(DDL);
  const app = db.prepare('INSERT INTO application VALUES (?, ?) ON CONFLICT(id) DO NOTHING');
  const context = db.prepare('INSERT INTO context VALUES (?, ?) ON CONFLICT(app, contexts) DO NOTHING');
  const put = db.prepare(`INSERT INTO binding VALUES (${Array.from({ length: 21 }, () => '?').join(',')})`);
  db.exec('BEGIN');
  try {
    for (const item of items) {
      const row = bindingRow(item);
      app.run(item.app.id, item.app.name);
      context.run(item.app.id, row[2]);
      put.run(...row);
    }
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

function csv(columns, rows) {
  const cell = (value) => {
    const text = String(value ?? '');
    return /[",\r\n]/.test(text) ? '"' + text.replaceAll('"', '""') + '"' : text;
  };
  return [columns.join(','), ...rows.map((row) => columns.map((column) => cell(row[column])).join(','))].join('\n') + '\n';
}

function run(args) {
  const { values } = parseArgs({ args, options: { report: { type: 'string', default: 'coverage' }, app: { type: 'string' },
    language: { type: 'string', default: 'en-US' }, format: { type: 'string', default: 'json' }, help: { type: 'boolean' } } });
  const { report, app, language, format, help } = values;
  if (help) return 'node scripts/shortcut-audit.js --report coverage|provenance|versions|overlaps [--app id] [--language en-US|it-IT] [--format json|csv]\n';
  if (!Object.hasOwn(REPORTS, report) || !['en-US', 'it-IT'].includes(language) || !['json', 'csv'].includes(format)) {
    throw new Error('Choose a report, shortcut language, and JSON or CSV format. Use --help for options.');
  }
  let DatabaseSync;
  try { ({ DatabaseSync } = require('node:sqlite')); }
  catch { throw new Error('Use Node.js 22.13 or later to generate the SQLite shortcut reports.'); }
  const db = new DatabaseSync(':memory:');
  try {
    buildAudit(db, catalogItems(language));
    const { columns, sql } = REPORTS[report];
    const rows = db.prepare(sql).all(app ?? null, app ?? null);
    return format === 'csv' ? csv(columns, rows) : JSON.stringify({ report, language, shortcutCatalogVersion: catalog.version, rows }, null, 2) + '\n';
  } finally { db.close(); }
}

if (require.main === module) {
  try { process.stdout.write(run(process.argv.slice(2))); }
  catch (error) { process.stderr.write(error.message + '\n'); process.exitCode = 1; }
}

module.exports = { buildAudit, normalizedChord, REPORTS, run };
