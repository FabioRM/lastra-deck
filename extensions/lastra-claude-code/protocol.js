'use strict';

const fs = require('node:fs');
const path = require('node:path');

const DIRECTORY = 'claude-code';
const VERSION = 1;
const STALE_MS = 3 * 60_000;
const KEEP_MS = 24 * 60 * 60_000;
const ID = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/;
const STATE = new Map([
  ['SessionStart', 'start'], ['SessionEnd', 'ended'], ['UserPromptSubmit', 'running'], ['PreToolUse', 'running'],
  ['PostToolUse', 'running'], ['PostToolUseFailure', 'running'], ['Stop', 'idle'], ['StopFailure', 'error'],
  ['Notification', null],
]);
const NOTIFICATION = new Map([['permission_prompt', 'approval'], ['idle_prompt', 'idle']]);
const PACKET = /^([0-9a-f-]{36})\.(start|ended|running|approval|idle|error|status)\.json$/;
const TITLE = /^Lastra Claude [A-Za-z0-9][A-Za-z0-9._-]{0,47}$/;

function terminalTitle(value) {
  return typeof value === 'string' && TITLE.test(value) ? value : null;
}

function projectDirectory(value) {
  if (typeof value !== 'string' || value.length > 1024 || /[\u0000-\u001f\u007f-\u009f]/.test(value)) return null;
  if (/^[a-z]:[\\/]/i.test(value) || /^\\\\[^\\]/.test(value)) return path.win32.normalize(value);
  return value.startsWith('/') ? path.posix.normalize(value) : null;
}

function projectName(directory) {
  return directory ? path.win32.basename(directory) || directory : 'Unknown project';
}

function reading(value, max) {
  return Number.isFinite(value) && value >= 0 && value <= max ? value : null;
}

function packet(input, mode, options = {}) {
  const session = typeof input?.session_id === 'string' ? input.session_id.toLowerCase() : '';
  if (!ID.test(session)) return null;
  const status = mode === 'status';
  const kind = status ? 'status' : input.hook_event_name === 'Notification' ? NOTIFICATION.get(input.notification_type) :
    STATE.get(input.hook_event_name);
  if (!kind) return null;
  return {
    version: VERSION, session, kind, updatedAt: options.now ?? Date.now(),
    directory: (status && projectDirectory(input.workspace?.project_dir)) || projectDirectory(input.cwd),
    terminal: terminalTitle(options.terminal),
    ...(status ? { context: reading(input.context_window?.used_percentage, 100), cost: reading(input.cost?.total_cost_usd, 1e9) } : {}),
  };
}

function readPacket(file, session, kind) {
  try {
    const stat = fs.lstatSync(file);
    if (!stat.isFile() || stat.size > 8192) return null;
    const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (raw?.version !== VERSION || raw.session !== session || raw.kind !== kind || !Number.isSafeInteger(raw.updatedAt)) return null;
    return {
      session, kind, updatedAt: raw.updatedAt, directory: projectDirectory(raw.directory), terminal: terminalTitle(raw.terminal),
      context: kind === 'status' ? reading(raw.context, 100) : null, cost: kind === 'status' ? reading(raw.cost, 1e9) : null,
    };
  } catch {
    return null;
  }
}

module.exports = { DIRECTORY, STALE_MS, KEEP_MS, ID, STATE, NOTIFICATION, PACKET, projectName, packet, readPacket };
