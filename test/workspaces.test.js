'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const { createActionRunner } = require('../src/main/actions');
const { validateProfile } = require('../src/main/profile');
const { Workspaces, normalizeWorkspaces, windowRect } = require('../src/main/workspaces');
const { tempDir } = require('./helpers/temp-dir');

const alpha = 'C:\\Tools\\Alpha.exe';
const beta = 'C:\\Tools\\Beta.exe';
const native = { id: 'work', name: 'Work', apps: [
  { target: alpha, placement: { display: 'primary', x: 0.5, y: 0, width: 0.5, height: 1 } },
  { target: beta, args: ['one argument'], placement: { display: 22, x: 0, y: 0.25, width: 1, height: 0.75 } },
] };
const powerToys = { id: 'zones', name: 'Zones', powerToysShortcut: 'C:\\Workspaces\\Zones.lnk' };
const config = (...workspaces) => ({ version: 1, workspaces });
const primary = { id: 11, primary: true, label: 'Primary', workArea: { x: 0, y: 0, width: 1920, height: 1040 } };
const secondary = { id: 22, label: 'Second', workArea: { x: -800, y: -15, width: 800, height: 600 } };

function fixture(t, ...entries) {
  const directory = tempDir(t, 'lastra-workspaces-');
  const file = path.join(directory, 'workspaces.json');
  fs.writeFileSync(file, JSON.stringify(config(...entries)));
  let time = 0;
  const present = [];
  const calls = [];
  const placed = new Map();
  const displays = [primary, secondary];
  const workspaces = new Workspaces(file, {
    displays: () => displays,
    toScreenRect: (rect) => Object.fromEntries(Object.entries(rect).map(([key, value]) => [key, value * 2])),
    windows: () => ({
      list: (match) => present.filter(match),
      reveal: (id) => { calls.push({ reveal: id }); return true; },
      place: (id, identity, rect) => {
        assert.equal(present.find((window) => window.id === id).path, identity);
        placed.set(id, rect);
        return true;
      },
      bounds: (id) => placed.get(id),
    }),
    run: async (action) => {
      calls.push(action);
      return { ok: true };
    },
    openConfig: async (file) => ({ file }),
    readShortcutLink: (file) => {
      assert.equal(file, powerToys.powerToysShortcut);
      return { target: 'C:\\Program Files\\PowerToys\\PowerToys.WorkspacesLauncher.exe' };
    },
    now: () => time,
    sleep: async (ms) => { time += ms; },
  });
  return { workspaces, calls, file, present, placed, displays };
}

test('workspace files use unique app paths and placements contained by the display work area', () => {
  assert.deepEqual(windowRect(primary.workArea, native.apps[0].placement), { x: 960, y: 0, width: 960, height: 1040 });
  assert.deepEqual(windowRect(secondary.workArea, native.apps[1].placement), { x: -800, y: 135, width: 800, height: 450 });
  assert.equal(normalizeWorkspaces(config(native, powerToys))[0].apps[0].identity, alpha.toLowerCase());
  assert.throws(() => normalizeWorkspaces(config(native, native)), /unique/);
  assert.throws(() => normalizeWorkspaces(config({ ...native, apps: [native.apps[0], native.apps[0]] })), /once/);
  assert.throws(() => normalizeWorkspaces(config({ ...native, apps: [{ target: 'relative.exe' }] })), /full local/);
  assert.throws(() => normalizeWorkspaces(config({ ...native, apps: [{ ...native.apps[0], placement: {
    ...native.apps[0].placement, width: 0.7 } }] })), /work area/);
});

test('restoration reuses a unique existing window, waits for new windows, and verifies both monitor positions', async (t) => {
  const { workspaces, present, placed, calls } = fixture(t, native);
  present.push({ id: '1', path: alpha.toLowerCase() });
  const start = workspaces.run;
  workspaces.run = async (action) => {
    queueMicrotask(() => present.push({ id: '2', path: beta.toLowerCase() }));
    return start(action);
  };
  assert.deepEqual(await workspaces.apply('work'), { ok: true, message: 'Restored Work' });
  assert.deepEqual(calls, [{ type: 'launch', target: beta, args: ['one argument'] }]);
  assert.deepEqual(placed.get('1'), { x: 1920, y: 0, width: 1920, height: 2080 });
  assert.deepEqual(placed.get('2'), { x: -1600, y: 270, width: 1600, height: 900 });
  assert.deepEqual(workspaces.snapshot().last.results.map(({ status }) => status), ['Reused and placed', 'Opened and placed']);
});

test('restoration skips missing monitors and ambiguous windows, and prevents duplicate launches', async (t) => {
  const { workspaces, present, displays, calls } = fixture(t, native);
  displays.pop();
  present.push({ id: '1', path: alpha.toLowerCase() }, { id: '1b', path: alpha.toLowerCase() });
  const result = await workspaces.apply('work');
  assert.equal(result.ok, false);
  assert.match(result.message, /More than one matching window/);
  assert.match(result.message, /saved display is unavailable/);
  assert.deepEqual(calls, []);
  present.length = 0;
  const first = workspaces.apply('work');
  await assert.rejects(workspaces.apply('work'), /already opening/);
  assert.match((await first).message, /No window appeared/);
  assert.match((await workspaces.apply('work')).message, /No window appeared/);
  assert.equal(calls.length, 1);
});

test('the deck and app view accept configured workspace IDs, including PowerToys links', async (t) => {
  const { workspaces, calls } = fixture(t, powerToys);
  const runner = createActionRunner({ restoreWorkspace: (id) => workspaces.apply(id) });
  const action = { type: 'workspace', workspace: 'zones' };
  const profile = { grid: { cols: 1, rows: 1 }, keys: [{ id: 'work', action }] };
  assert.doesNotThrow(() => validateProfile(profile));
  assert.throws(() => validateProfile({ ...profile, keys: [{ id: 'work', action: { ...action, workspace: 'Zones' } }] }), /lowercase ID/);
  assert.equal((await runner.run(action)).ok, true);
  assert.deepEqual(calls, [{ type: 'open', target: powerToys.powerToysShortcut }]);
  assert.equal(workspaces.snapshot().last.results[0].status, 'Sent to PowerToys Workspaces');
  await assert.rejects(workspaces.change({ action: 'apply', id: 'unknown' }), /unavailable/);
  workspaces.readShortcutLink = () => ({ target: alpha });
  await assert.rejects(workspaces.change({ action: 'apply', id: 'zones' }), /created by PowerToys/);
});
