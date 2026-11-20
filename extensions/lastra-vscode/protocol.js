'use strict';

const fs = require('node:fs');
const { randomBytes } = require('node:crypto');
const path = require('node:path');

const VERSION = 1;
const DIRECTORY = 'vscode-bridge';
const HEARTBEAT_MS = 1_250;
const STALE_MS = 8_000;
const REQUEST_MS = 12_000;
const MAX_TASKS = 32;
const ID = /^[0-9a-f]{32}$/;
const SESSION_FILE = /^session-([0-9a-f]{32})\.json$/;
const RESULTS = new Set(['idle', 'running', 'finished', 'passed', 'failed']);
const DEBUG_STATES = new Set(['inactive', 'active', 'running', 'paused']);
const COMMAND_STATES = new Set(['accepted', 'untrusted', 'missing-task', 'busy', 'failed']);

function makeId() { return randomBytes(16).toString('hex'); }

function sessionPath(directory, id) { return path.join(directory, `session-${id}.json`); }

function commandPath(directory, id) { return path.join(directory, `request-${id}.json`); }

function readPacket(file) {
  try {
    const stat = fs.lstatSync(file);
    if (!stat.isFile() || stat.size > 48 * 1024) return null;
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

function publishSession(file, value) {
  const pending = `${file}.${makeId()}.tmp`;
  try {
    fs.writeFileSync(pending, JSON.stringify(value), { encoding: 'utf8', flag: 'wx' });
    fs.renameSync(pending, file);
  } finally {
    removePacket(pending);
  }
}

function takeCommand(file) {
  const claimed = file + '.reading';
  try { fs.renameSync(file, claimed); }
  catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
  try { return readPacket(claimed); }
  finally { removePacket(claimed); }
}

function removePacket(file) {
  try { fs.unlinkSync(file); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
}

function shortText(value, maxLength = 120) {
  if (typeof value !== 'string') return null;
  return value.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, maxLength) || null;
}

function positiveInteger(value) {
  return Number.isSafeInteger(value) && value >= 0 ? value : null;
}

function snapshotPacket(value, session) {
  if (value?.version !== VERSION || value.session !== session || !ID.test(session)
      || !Number.isSafeInteger(value.updatedAt) || !Array.isArray(value.tasks) || value.tasks.length > MAX_TASKS) return null;
  const tasks = [];
  const seen = new Set();
  for (const task of value.tasks) {
    const name = shortText(task?.name);
    if (typeof task?.id !== 'string' || !ID.test(task.id) || !name || seen.has(task.id) || !RESULTS.has(task.status)) return null;
    tasks.push({ id: task.id, name, folder: shortText(task.folder), test: task.test === true, status: task.status,
      elapsed: positiveInteger(task.elapsed), exitCode: Number.isSafeInteger(task.exitCode) ? task.exitCode : null });
    seen.add(task.id);
  }
  const command = value.command;
  const results = value.tests;
  const counts = ['passed', 'failed', 'skipped'];
  return {
    session, updatedAt: value.updatedAt, name: shortText(value.name) ?? 'No workspace', remote: shortText(value.remote, 48),
    focused: value.focused === true, trusted: value.trusted === true, file: shortText(value.file, 240), branch: shortText(value.branch),
    projectKey: typeof value.projectKey === 'string' && /^[0-9a-f]{64}$/.test(value.projectKey) ? value.projectKey : null,
    problems: Object.fromEntries(['errors', 'warnings', 'information', 'hints'].map((key) => [key, positiveInteger(value.problems?.[key])])),
    debug: { state: DEBUG_STATES.has(value.debug?.state) ? value.debug.state : 'inactive', name: shortText(value.debug?.name) },
    tasks,
    command: typeof command?.id === 'string' && ID.test(command.id) && COMMAND_STATES.has(command.state)
      ? { id: command.id, state: command.state } : null,
    tests: results && counts.every((key) => positiveInteger(results[key]) !== null) && typeof results.success === 'boolean'
      ? { passed: results.passed, failed: results.failed, skipped: results.skipped,
        success: results.success, updatedAt: results.updatedAt <= 8.64e15 ? positiveInteger(results.updatedAt) : null } : null,
    testReportConfigured: value.testReportConfigured === true,
  };
}

function validRequest(value, session, now) {
  return value?.version === VERSION && value.session === session && typeof value.id === 'string' && ID.test(value.id)
    && typeof value.task === 'string' && ID.test(value.task) && Number.isSafeInteger(value.issuedAt)
    && value.issuedAt <= now + 1_000 && now - value.issuedAt <= REQUEST_MS;
}

module.exports = {
  VERSION, DIRECTORY, HEARTBEAT_MS, STALE_MS, REQUEST_MS, MAX_TASKS, ID, SESSION_FILE,
  commandPath, sessionPath, makeId, readPacket, publishSession, takeCommand, removePacket,
  shortText, positiveInteger, snapshotPacket, validRequest,
};
