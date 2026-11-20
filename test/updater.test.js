'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { createUpdater } = require('../src/main/updater');

class FakeAutoUpdater extends EventEmitter {
  constructor(behaviour = 'none') {
    super();
    this.behaviour = behaviour;
    this.checks = 0;
    this.installs = [];
  }

  async checkForUpdates() {
    this.checks += 1;
    this.emit('checking-for-update');
    if (this.behaviour === 'throw') throw new Error('net::ERR_INTERNET_DISCONNECTED\nlong body');
    if (this.behaviour === 'update') {
      const info = { version: '0.3.0' };
      this.emit('update-available', info);
      return { isUpdateAvailable: true, updateInfo: info, downloadPromise: Promise.reject(new Error('reported via event')) };
    }
    this.emit('update-not-available', { version: '0.2.1' });
    return { isUpdateAvailable: false, updateInfo: { version: '0.2.1' } };
  }

  quitAndInstall(isSilent, forceRunAfter) {
    this.installs.push([isSilent, forceRunAfter]);
  }
}

function fakeTimers() {
  const timers = { timeouts: [], intervals: [] };
  return Object.assign(timers, {
    setTimeout: (fn, ms) => { const handle = { fn, ms }; timers.timeouts.push(handle); return handle; },
    clearTimeout: (handle) => { timers.timeouts = timers.timeouts.filter((entry) => entry !== handle); },
    setInterval: (fn, ms) => { const handle = { fn, ms }; timers.intervals.push(handle); return handle; },
    clearInterval: (handle) => { timers.intervals = timers.intervals.filter((entry) => entry !== handle); },
  });
}

function setup({ isPackaged = true, env = {}, preview = false, hasUpdateConfig = true, behaviour } = {}) {
  const fake = new FakeAutoUpdater(behaviour);
  const lines = [];
  const changes = [];
  const timers = fakeTimers();
  let loads = 0;
  const updater = createUpdater({
    app: { isPackaged }, env, preview, timers, now: () => 1000,
    log: (...args) => lines.push(args.join(' ')),
    loadAutoUpdater: () => { loads += 1; return fake; },
    hasUpdateConfig: () => hasUpdateConfig,
    onChange: (status) => changes.push(status),
  });
  return { updater, fake, lines, changes, timers, loads: () => loads };
}

test('updates stay off in development, preview, unpacked builds, and with LASTRA_DISABLE_UPDATES', async () => {
  for (const [options, reason] of [
    [{ isPackaged: false }, 'not-packaged'],
    [{ preview: true }, 'preview'],
    [{ env: { LASTRA_DISABLE_UPDATES: '1' } }, 'LASTRA_DISABLE_UPDATES'],
    [{ hasUpdateConfig: false }, 'no-update-config'],
  ]) {
    const { updater, timers, loads, fake } = setup(options);
    assert.deepEqual(updater.status(), { state: 'disabled', reason });
    assert.equal(updater.start(), false);
    assert.equal(timers.timeouts.length + timers.intervals.length, 0);
    assert.deepEqual(await updater.checkNow(), { state: 'disabled', reason });
    assert.equal(loads(), 0, 'electron-updater is never loaded while disabled');
    assert.equal(fake.checks, 0);
  }
  assert.equal(setup({ isPackaged: false }).updater.menuItem(), null);
  assert.deepEqual(setup({ env: { LASTRA_DISABLE_UPDATES: '1' } }).updater.menuItem(), { label: 'Updates turned off', enabled: false });
  assert.equal(setup({ env: { LASTRA_DISABLE_UPDATES: '0' } }).updater.status().state, 'idle');
});

test('start schedules one delayed check and periodic checks, and stop clears them', async () => {
  const { updater, timers, fake } = setup();
  assert.equal(updater.start(), true);
  assert.equal(updater.start(), true);
  assert.equal(timers.timeouts.length, 1);
  assert.equal(timers.intervals.length, 1);
  assert.ok(timers.timeouts[0].ms >= 30_000, 'the first check waits for the deck to settle');
  assert.ok(timers.intervals[0].ms >= 60 * 60 * 1000, 'periodic checks are hours apart');
  assert.equal(fake.checks, 0, 'nothing is checked synchronously at startup');
  timers.timeouts[0].fn();
  await new Promise(setImmediate);
  assert.equal(fake.checks, 1);
  updater.stop();
  assert.equal(timers.intervals.length, 0);
});

test('a check configures background download and install on quit, and reports up to date', async () => {
  const { updater, fake, changes } = setup();
  const status = await updater.checkNow();
  assert.deepEqual(status, { state: 'up-to-date', checkedAt: 1000 });
  assert.equal(fake.autoDownload, true);
  assert.equal(fake.autoInstallOnAppQuit, true);
  assert.equal(fake.allowPrerelease, false);
  assert.equal(typeof fake.logger.info, 'function');
  assert.deepEqual(changes.map(({ state }) => state), ['checking', 'up-to-date']);
  assert.equal(updater.menuItem().label, 'Check for updates (up to date)');
});

test('concurrent checks share one request', async () => {
  const { updater, fake } = setup();
  const [first, second] = await Promise.all([updater.checkNow(), updater.checkNow()]);
  assert.equal(fake.checks, 1);
  assert.deepEqual(first, second);
});

test('an available update downloads in the background and offers a restart from the tray', async () => {
  const { updater, fake, lines } = setup({ behaviour: 'update' });
  const status = await updater.checkNow();
  assert.equal(status.state, 'downloading');
  assert.equal(status.version, '0.3.0');
  assert.match(updater.menuItem().label, /^Downloading update 0\.3\.0 \(0%\)$/);
  assert.equal(updater.menuItem().enabled, false);

  fake.emit('download-progress', { percent: 4.2 });
  assert.equal(updater.status().percent, 0, 'small progress steps do not churn the tray');
  fake.emit('download-progress', { percent: 57.9 });
  assert.equal(updater.status().percent, 57);

  assert.equal(updater.restartToUpdate(), false, 'nothing to install before the download ends');
  fake.emit('update-downloaded', { version: '0.3.0' });
  assert.equal(updater.status().state, 'downloaded');
  assert.ok(lines.some((line) => line.includes('installs when Lastra quits')));

  assert.equal((await updater.checkNow()).state, 'downloaded');
  assert.equal(fake.checks, 1, 'a downloaded update is not checked again');

  fake.emit('error', new Error('later network failure'));
  assert.equal(updater.status().state, 'downloaded', 'a later error keeps the ready update');

  const item = updater.menuItem();
  assert.equal(item.label, 'Restart to update to 0.3.0');
  item.click();
  assert.deepEqual(fake.installs, [[true, true]]);
});

test('a failed check is logged once, shown in the tray, and can be retried', async () => {
  const { updater, fake, lines } = setup({ behaviour: 'throw' });
  const status = await updater.checkNow();
  assert.equal(status.state, 'error');
  assert.equal(status.message, 'net::ERR_INTERNET_DISCONNECTED');
  assert.ok(lines.some((line) => line.includes('check failed')));
  assert.equal(updater.menuItem().label, 'Check for updates (last check failed)');
  fake.behaviour = 'none';
  updater.menuItem().click();
  await new Promise(setImmediate);
  assert.equal(updater.status().state, 'up-to-date');
});

test('a throwing status listener does not break the updater', async () => {
  const fake = new FakeAutoUpdater();
  const lines = [];
  const updater = createUpdater({ app: { isPackaged: true }, env: {}, hasUpdateConfig: () => true,
    loadAutoUpdater: () => fake, log: (...args) => lines.push(args.join(' ')),
    onChange: () => { throw new Error('tray gone'); } });
  assert.equal((await updater.checkNow()).state, 'up-to-date');
  assert.ok(lines.some((line) => line.includes('tray gone')));
});
