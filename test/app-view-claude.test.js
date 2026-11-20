'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { test } = require('node:test');
const { ClaudeView, chatUrl, normalizeClaudeConfig } = require('../src/main/app-view-claude');
const { BUILT_IN_APP_VIEWS } = require('../src/main/app-view-catalog');
const { DIRECTORY, STALE_MS, packet } = require('../extensions/lastra-claude-code/protocol');
const { tempDir } = require('./helpers/temp-dir');

const CLI = path.resolve(__dirname, '../extensions/lastra-claude-code/hook.js');
const first = 'a0123456-aaaa-00aa-bbbb-0123456789ab';
const second = 'b0123456-bbbb-00aa-bbbb-0123456789ab';
const title = 'Lastra Claude fixture-work';
const directory = 'D:\\Example projects\\fixture-work';
const cliInput = { session_id: first, cwd: directory, transcript_path: '/fixture/transcript.jsonl', prompt: 'fixture-sensitive-text',
  tool_input: { fixture: 'private input' }, tool_response: { fixture: 'private output' } };

function fixture(t, options = {}) {
  const userData = tempDir(t, 'lastra-claude-fixture-');
  const local = path.join(userData, DIRECTORY);
  const view = new ClaudeView(userData, { platform: 'win32', ...options });
  const runCli = (mode, input, { terminal = title, flags = [] } = {}) => {
    const processResult = spawnSync(process.execPath, [CLI, mode, '--directory', local, ...flags], {
      cwd: userData, input: typeof input === 'string' ? input : JSON.stringify(input), encoding: 'utf8', timeout: 5000,
      env: { ...process.env, LASTRA_CLAUDE_TERMINAL_TITLE: terminal },
    });
    assert.ifError(processResult.error);
    assert.equal(processResult.status, 0);
    assert.equal(processResult.stderr, '');
    return processResult.stdout.trim();
  };
  return { view, local, runCli };
}

function event(kind, session = first, changes = {}) {
  return { ...cliInput, session_id: session, hook_event_name: kind, ...changes };
}

function status(session = first, changes = {}) {
  return { ...cliInput, session_id: session, workspace: { project_dir: directory, current_dir: directory + '\\src' },
    context_window: { used_percentage: 24 }, cost: { total_cost_usd: 0.0012 }, ...changes };
}

function writePacket(local, input, mode, now, terminal = title) {
  const data = packet(input, mode, { now, terminal });
  assert.ok(data);
  fs.mkdirSync(local, { recursive: true });
  fs.writeFileSync(path.join(local, `${data.session}.${data.kind}.json`), JSON.stringify(data));
}

test('Claude Code settings generation is explicit and executable without changing a settings file', (t) => {
  const { runCli, local } = fixture(t);
  const generated = JSON.parse(runCli('--settings', undefined, { flags: ['--powershell'] }));
  assert.equal(fs.existsSync(local), false);
  assert.match(generated.statusLine.command, /^& '/);
  assert.equal(generated.statusLine.refreshInterval, 30);
  assert.deepEqual(Object.keys(generated.hooks.Notification[0]), ['matcher', 'hooks']);
  assert.equal(generated.hooks.Notification[0].matcher, 'permission_prompt|idle_prompt');
  const handler = generated.hooks.SessionStart[0].hooks[0];
  assert.deepEqual(handler.args, [CLI, '--hook', '--directory', local]);
  const run = spawnSync(handler.command, handler.args, { input: JSON.stringify(event('SessionStart')), encoding: 'utf8', timeout: 5000 });
  assert.equal(run.status, 0);
  assert.equal(run.stdout, '');
  assert.equal(fs.existsSync(path.join(local, `${first}.start.json`)), true);
  assert.equal(generated.hooks.PermissionRequest, undefined);
});

test('hook subprocesses report running, waiting, metrics and shutdown without printing or storing private tool data', (t) => {
  const { runCli, local, view } = fixture(t);
  assert.equal(view.snapshot().status, 'setup');
  assert.equal(runCli('--hook', '{invalid'), '');
  assert.equal(runCli('--hook', event('SessionStart', '../../private')), '');
  assert.equal(fs.existsSync(local), false);
  assert.equal(runCli('--hook', event('SessionStart')), '');
  assert.equal(view.snapshot().sessions[0].state, 'idle');
  assert.equal(runCli('--hook', event('UserPromptSubmit')), '');
  assert.equal(view.snapshot().sessions[0].state, 'running');
  assert.equal(runCli('--hook', event('Notification', first, { notification_type: 'permission_prompt', message: 'secret fixture command' })), '');
  const rendered = runCli('--status', status());
  assert.equal(rendered, 'fixture-work · Context 24% · $0.0012');
  const data = view.snapshot();
  assert.equal(data.sessions[0].state, 'approval');
  assert.equal(data.sessions[0].context, 24);
  assert.equal(data.sessions[0].cost, 0.0012);
  assert.equal(data.sessions[0].project, 'fixture-work');
  assert.equal(data.sessions[0].directory, undefined);
  for (const name of fs.readdirSync(local)) {
    const persisted = fs.readFileSync(path.join(local, name), 'utf8');
    assert.doesNotMatch(persisted, /transcript|fixture-sensitive-text|private input|private output|secret fixture command/);
  }
  assert.equal(runCli('--hook', event('PostToolUseFailure')), '');
  assert.equal(view.snapshot().sessions[0].state, 'running');
  assert.equal(runCli('--hook', event('StopFailure')), '');
  assert.equal(view.snapshot().sessions[0].state, 'error');
  assert.equal(runCli('--hook', event('Stop')), '');
  assert.equal(view.snapshot().sessions[0].state, 'idle');
  assert.equal(runCli('--hook', event('SessionEnd')), '');
  assert.equal(runCli('--status-observe', status()), '');
  assert.equal(view.snapshot().status, 'offline');
  assert.deepEqual(view.snapshot().sessions, []);
});

test('seen sessions expire and a resumed session keeps fresh activity apart from old metrics and approvals', (t) => {
  const start = Date.now();
  let now = start;
  const { local, view } = fixture(t, { now: () => now });
  writePacket(local, event('SessionStart'), 'hook', start - 5000);
  writePacket(local, event('Notification', first, { notification_type: 'permission_prompt' }), 'hook', start - 4000);
  writePacket(local, status(), 'status', start - 3000);
  writePacket(local, event('SessionEnd'), 'hook', start - 2000);
  assert.equal(view.snapshot().status, 'offline');
  writePacket(local, event('SessionStart'), 'hook', start - 1000);
  assert.equal(view.snapshot().sessions[0].state, 'idle');
  assert.equal(view.snapshot().sessions[0].context, null);
  writePacket(local, status(second, { context_window: { used_percentage: 0 }, cost: { total_cost_usd: 0 } }), 'status', start);
  assert.equal(view.snapshot().sessions[0].state, 'unknown');
  assert.equal(view.snapshot().sessions[0].context, 0);
  assert.equal(view.snapshot().sessions[0].cost, 0);
  now = start + STALE_MS + 1;
  assert.equal(view.snapshot().status, 'offline');
});

test('session actions target only the revalidated live terminal and local project directory', async (t) => {
  const now = Date.now();
  const opened = [];
  const focused = [];
  let available = [
    { title, id: '11:12', path: 'C:\\fixture\\WindowsTerminal.exe', executable: 'windowsterminal.exe' },
    { title, id: '21:22', path: 'C:\\fixture\\Other.exe', executable: 'other.exe' },
  ];
  const { local, view } = fixture(t, { now: () => now, run: async (command) => { opened.push(command); return { ok: true }; },
    windows: () => ({ list: (accept) => available.filter(accept), focus: (accept, id) => {
      focused.push(id);
      return available.some((window) => window.id === id && accept(window));
    } }) });
  writePacket(local, event('SessionStart'), 'hook', now - 100);
  assert.equal(view.snapshot().sessions[0].terminalAvailable, true);
  assert.deepEqual(await view.change({ action: 'focus-terminal', session: first, id: '21:22' }), { ok: true });
  assert.deepEqual(focused, ['11:12']);
  await view.change({ action: 'project-shell', session: first, directory: 'D:\\ignored' });
  assert.deepEqual(opened, [{ type: 'launch', target: 'wt.exe', args: ['new-tab', '--startingDirectory', directory] }]);
  available.push({ ...available[0], id: '31:32' });
  assert.equal(view.snapshot().sessions[0].terminalAvailable, false);
  await assert.rejects(view.change({ action: 'focus-terminal', session: first }), /terminal is unavailable/);
  available = [available[0]];
  writePacket(local, event('SessionStart', second, { cwd: 'D:\\injection; new-tab' }), 'hook', now);
  assert.equal(view.snapshot().sessions.find((s) => s.session === second).projectShellAvailable, false);
  assert.equal(view.snapshot().sessions.every((s) => !s.terminalAvailable), true);
  await assert.rejects(view.change({ action: 'project-shell', session: second }), /directory is unavailable/);
  await assert.rejects(view.change({ action: 'allow-permission', session: first }), /Unknown Claude command/);
});

test('Claude catalog and saved chats use registered destinations and a local desktop path', async (t) => {
  const builtin = BUILT_IN_APP_VIEWS.find((entry) => entry.id === 'claude');
  assert.equal(builtin.provider, 'claude');
  const opened = [];
  const { view } = fixture(t, { openConfig: async (file) => { assert.equal(file, view.file); return { ok: true }; },
    run: async (action) => { opened.push(action); return { ok: true }; } });
  assert.equal(chatUrl(`https://claude.ai/chat/${first}?from=fixture#anchor`), `https://claude.ai/chat/${first}`);
  assert.equal(chatUrl(`https://claude.ai/share/${first}`), `https://claude.ai/share/${first}`);
  for (const url of [`https://claude.ai.example.test/chat/${first}`, `https://fake@claude.ai/chat/${first}`, `https://claude.ai/external/${first}`]) {
    assert.equal(chatUrl(url), null);
  }
  await view.change({ action: 'edit-config' });
  assert.deepEqual(JSON.parse(fs.readFileSync(view.file)), { version: 1, links: [] });
  const config = { version: 1, desktop: { path: 'D:\\Fixture install\\Claude.lnk' },
    links: [{ id: 'fixture', name: 'Fixture chat', url: `https://claude.ai/chat/${first}?ignored=1` }] };
  fs.writeFileSync(view.file, JSON.stringify(config));
  assert.deepEqual(view.snapshot().links, [{ id: 'fixture', name: 'Fixture chat' }]);
  await view.change({ action: 'open-link', id: 'fixture', url: 'https://example.test/' });
  await view.change({ action: 'open-desktop', path: 'D:\\untrusted.exe' });
  assert.deepEqual(opened, [{ type: 'open', target: `https://claude.ai/chat/${first}` }, { type: 'open', target: config.desktop.path }]);
  await assert.rejects(view.change({ action: 'open-link', id: second }), /chat is unavailable/);
  assert.throws(() => normalizeClaudeConfig({ ...config, desktop: { path: 'D:\\other.exe' } }), /Claude Desktop/);
});
