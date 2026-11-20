'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { writeAtomic } = require('../../src/main/write-atomic');
const { DIRECTORY, KEEP_MS, STATE, NOTIFICATION, PACKET, projectName, packet, readPacket } = require('./protocol');

const MAX_INPUT = 1024 * 1024;
const MODES = new Set(['--hook', '--status', '--status-observe', '--settings']);

function parseArgs(args, env) {
  const [mode, ...flags] = args;
  if (!MODES.has(mode)) return null;
  let directory = env.APPDATA && path.join(env.APPDATA, 'Lastra', DIRECTORY);
  let powershell = false;
  for (let i = 0; i < flags.length; i++) {
    if (flags[i] === '--directory' && flags[i + 1] && path.isAbsolute(flags[i + 1])) directory = flags[++i];
    else if (flags[i] === '--powershell' && mode === '--settings') powershell = true;
    else return null;
  }
  return directory && path.isAbsolute(directory) ? { mode, directory, powershell } : null;
}

function settings(directory, powershell) {
  const args = [__filename, '--hook', '--directory', directory];
  const handler = () => ({ type: 'command', command: process.execPath, args, timeout: 3 });
  const hooks = Object.fromEntries([...STATE.keys()].map((event) => [event, [{
    ...(event === 'Notification' ? { matcher: [...NOTIFICATION.keys()].join('|') } : {}), hooks: [handler()],
  }]]));
  const quote = powershell ? (value) => `'${value.replaceAll("'", "''")}'` : (value) => "'" +
    value.replaceAll('\\', '/').replaceAll("'", "'\\''") + "'";
  const status = [process.execPath, __filename, '--status', '--directory', directory].map(quote).join(' ');
  return { hooks, statusLine: { type: 'command', command: (powershell ? '& ' : '') + status, refreshInterval: 30 } };
}

function prune(directory, now) {
  try {
    for (const file of fs.readdirSync(directory, { withFileTypes: true })) {
      if (!file.isFile() || !PACKET.test(file.name)) continue;
      const target = path.join(directory, file.name);
      try { if (fs.lstatSync(target).mtimeMs < now - KEEP_MS) fs.unlinkSync(target); } catch { /* Concurrent hooks may replace it. */ }
    }
  } catch { /* Activity reporting still works if earlier data cannot be removed. */ }
}

function save(directory, data) {
  fs.mkdirSync(directory, { recursive: true });
  if (data.kind === 'start') prune(directory, data.updatedAt);
  const file = path.join(directory, `${data.session}.${data.kind}.json`);
  const previous = readPacket(file, data.session, data.kind);
  if (!previous || previous.updatedAt <= data.updatedAt) writeAtomic(file, JSON.stringify(data));
}

async function main(args) {
  const options = parseArgs(args, process.env);
  if (!options) return;
  if (options.mode === '--settings') {
    process.stdout.write(JSON.stringify(settings(options.directory, options.powershell), null, 2) + '\n');
    return;
  }
  const now = Date.now();
  const chunks = [];
  let size = 0;
  for await (const chunk of process.stdin) {
    size += chunk.length;
    if (size > MAX_INPUT) return;
    chunks.push(chunk);
  }
  const isStatus = options.mode !== '--hook';
  const input = JSON.parse(Buffer.concat(chunks).toString('utf8').replace(/^\uFEFF/, ''));
  const data = packet(input, isStatus ? 'status' : 'hook', { now, terminal: process.env.LASTRA_CLAUDE_TERMINAL_TITLE });
  if (!data) return;
  try { save(options.directory, data); } catch { /* Report-only hooks leave the Claude Code decision flow alone. */ }
  if (options.mode !== '--status') return;
  const fields = [projectName(data.directory)];
  if (data.context !== null) fields.push(`Context ${data.context}%`);
  if (data.cost !== null) fields.push(`$${data.cost.toFixed(4)}`);
  process.stdout.write(fields.join(' · ') + '\n');
}

// A malformed payload or unavailable directory must never block Claude Code.
main(process.argv.slice(2)).catch(() => {});
