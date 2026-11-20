// @ts-check
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { writeAtomic } = require('./write-atomic');
const { VERSION, DIRECTORY, STALE_MS, ID, SESSION_FILE, commandPath, sessionPath, makeId,
  readPacket, snapshotPacket } = require('../../extensions/lastra-vscode/protocol');

class VscodeView {
  constructor(userData, { now = Date.now } = {}) {
    this.directory = path.join(userData, DIRECTORY);
    this.now = now;
  }

  readSession(id) {
    return snapshotPacket(readPacket(sessionPath(this.directory, id)), id);
  }

  isFresh(session) {
    const age = this.now() - session.updatedAt;
    return age >= -1_000 && age <= STALE_MS;
  }

  sessions() {
    let names;
    try { names = fs.readdirSync(this.directory, { withFileTypes: true }); }
    catch (error) { return { status: error.code === 'ENOENT' ? 'setup' : 'unavailable', sessions: [] }; }
    const records = [];
    for (const file of names) {
      const id = file.isFile() && SESSION_FILE.exec(file.name)?.[1];
      const session = id && this.readSession(id);
      if (session) records.push(session);
    }
    const sessions = records.filter((session) => this.isFresh(session));
    sessions.sort((a, b) => Number(b.focused) - Number(a.focused) || a.name.localeCompare(b.name) || b.updatedAt - a.updatedAt);
    return { status: sessions.length ? 'ready' : records.length ? 'offline' : 'setup', sessions: sessions.slice(0, 16) };
  }

  snapshot() {
    const { status, sessions } = this.sessions();
    return { status, sessions: sessions.map(({ projectKey, ...session }) => session) };
  }

  currentProject() {
    const { sessions } = this.sessions();
    const focused = sessions.filter(({ focused }) => focused);
    const session = focused.length === 1 ? focused[0] : null;
    return session?.trusted && !session.remote && session.projectKey ? { session: session.session, key: session.projectKey } : null;
  }

  change(command) {
    if (command?.action !== 'run-task' || typeof command.session !== 'string' || !ID.test(command.session)
        || typeof command.task !== 'string' || !ID.test(command.task)) throw new Error('Invalid VS Code task request.');
    const session = this.readSession(command.session);
    if (!session || !this.isFresh(session)) throw new Error('The VS Code workspace is offline.');
    if (!session.trusted) throw new Error('Trust the workspace in VS Code before running a task.');
    const task = session.tasks.find(({ id }) => id === command.task);
    if (!task) throw new Error('This task is unavailable in the selected VS Code workspace.');
    if (task.status === 'running') throw new Error('This task is already running.');
    const mailbox = commandPath(this.directory, session.session);
    if (fs.existsSync(mailbox)) throw new Error('This workspace already has a pending task request.');
    const request = makeId();
    const issuedAt = this.now();
    try {
      writeAtomic(mailbox, JSON.stringify({ version: VERSION, session: session.session, id: request, task: task.id, issuedAt }));
    } catch {
      throw new Error('Could not send the task request to VS Code.');
    }
    return { ok: true, request, issuedAt };
  }
}

module.exports = { VscodeView };
