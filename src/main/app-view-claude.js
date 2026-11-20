// @ts-check
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { readMonitorConfig, openMonitorConfig } = require('./monitoring-config');
const { DIRECTORY, ID, PACKET, STALE_MS, projectName, readPacket } = require('../../extensions/lastra-claude-code/protocol');

const LINK = /^[a-z0-9_-]{1,48}$/;
const APP_ID = /^[A-Za-z0-9.-]{1,80}_[a-z0-9]{13}![A-Za-z0-9._-]{1,64}$/i;
const ORDER = ['start', 'running', 'approval', 'idle', 'error', 'ended'];
const DISPLAY = { start: 'idle', running: 'running', approval: 'approval', idle: 'idle', error: 'error' };

function chatUrl(value) {
  if (typeof value !== 'string' || value.length > 2048 || /[\u0000-\u001f\u007f]/.test(value)) return null;
  try {
    const url = new URL(value);
    if (url.origin !== 'https://claude.ai' || url.username || url.password) return null;
    const [, kind, id] = /^\/(chat|share)\/([0-9a-f-]+)\/?$/i.exec(url.pathname) || [];
    return ID.test(id?.toLowerCase() ?? '') ? `https://claude.ai/${kind}/${id}` : null;
  } catch {
    return null;
  }
}

function localWindowsDirectory(value) {
  if (typeof value !== 'string' || value.length > 1024 || !/^[a-z]:[\\/]/i.test(value) ||
    /[<>:"|?*%;\u0000-\u001f\u007f]/.test(value.slice(2))) return null;
  return path.win32.normalize(value);
}

function desktopTarget(value) {
  if (value === undefined || value === null) return null;
  if (typeof value?.appId === 'string' && APP_ID.test(value.appId)) return { appId: value.appId };
  const target = localWindowsDirectory(value?.path);
  if (target && /^claude\.(?:exe|lnk)$/i.test(path.win32.basename(target))) return { path: target };
  throw new Error('Set the Claude Desktop app ID or an absolute path to Claude.exe or Claude.lnk.');
}

function normalizeClaudeConfig(config) {
  if (config?.version !== 1 || !Array.isArray(config.links) || config.links.length > 32) {
    throw new Error('Use version 1 and a list of up to 32 Claude chat links.');
  }
  const ids = new Set();
  const links = config.links.map((entry, index) => {
    const name = typeof entry?.name === 'string' ? entry.name.trim() : '';
    const url = chatUrl(entry?.url);
    if (typeof entry?.id !== 'string' || !LINK.test(entry.id) || ids.has(entry.id) || !name || name.length > 80 ||
      /[\u0000-\u001f\u007f]/.test(name) || !url) throw new Error(`Claude chat link ${index + 1} needs a unique ID, display name and Claude chat URL.`);
    ids.add(entry.id);
    return { id: entry.id, name, url };
  });
  return { links, desktop: desktopTarget(config.desktop) };
}

function sessionInfo(session, records, now) {
  const startup = records.start?.updatedAt ?? 0;
  if (records.ended && records.ended.updatedAt >= startup) return null;
  const event = ORDER.map((key) => records[key]).filter((value) => value && value.updatedAt >= startup)
    .sort((a, b) => b.updatedAt - a.updatedAt || ORDER.indexOf(b.kind) - ORDER.indexOf(a.kind))[0];
  const status = records.status?.updatedAt >= startup ? records.status : null;
  const updatedAt = Math.max(event?.updatedAt ?? 0, status?.updatedAt ?? 0);
  if (!updatedAt || now - updatedAt > STALE_MS) return null;
  const freshStatus = status && now - status.updatedAt <= STALE_MS ? status : null;
  const directory = freshStatus?.directory ?? event?.directory ?? null;
  const state = event && (now - event.updatedAt <= STALE_MS || ['idle', 'start'].includes(event.kind)) ? DISPLAY[event.kind] : 'unknown';
  return {
    session, directory, project: projectName(directory), state, updatedAt,
    terminal: event?.terminal ?? freshStatus?.terminal ?? null,
    context: freshStatus?.context ?? null, cost: freshStatus?.cost ?? null,
  };
}

function isWindowsTerminal(window) {
  return window.executable?.toLowerCase() === 'windowsterminal.exe';
}

class ClaudeView {
  /**
   * @param {string} userData
   * @param {{ platform?: NodeJS.Platform, openConfig?: (file: string) => any, run?: (action: Record<string, any>, pageApps?: any, options?: Record<string, any>) => Promise<any>,
   *   windows?: () => any, now?: () => number }} [options]
   */
  constructor(userData, { platform = process.platform, openConfig, run, windows = () => null, now = Date.now } = {}) {
    this.directory = path.join(userData, DIRECTORY);
    this.file = path.join(userData, 'claude.json');
    this.platform = platform;
    this.openConfig = openConfig;
    this.run = run;
    this.windows = windows;
    this.now = now;
  }

  config() {
    const value = readMonitorConfig(this.file, 'Claude links', normalizeClaudeConfig);
    return { links: value.links ?? [], desktop: value.desktop ?? null };
  }

  sessions() {
    const bySession = new Map();
    const now = this.now();
    let entries;
    try { entries = fs.readdirSync(this.directory, { withFileTypes: true }); }
    catch (error) { return { status: error.code === 'ENOENT' ? 'setup' : 'unavailable', sessions: [] }; }
    for (const file of entries) {
      const match = file.isFile() && PACKET.exec(file.name);
      if (!match || !ID.test(match[1])) continue;
      const [, session, kind] = match;
      const record = readPacket(path.join(this.directory, file.name), session, kind);
      if (!record || record.updatedAt < 1 || record.updatedAt - now > 1000) continue;
      if (!bySession.has(session)) bySession.set(session, {});
      bySession.get(session)[kind] = record;
    }
    const sessions = [...bySession].map(([session, records]) => sessionInfo(session, records, now)).filter(Boolean);
    sessions.sort((a, b) => Number(b.state === 'approval') - Number(a.state === 'approval') || b.updatedAt - a.updatedAt || a.session.localeCompare(b.session));
    return { status: sessions.length ? 'ready' : bySession.size ? 'offline' : 'setup', sessions };
  }

  terminalWindows(sessions) {
    const counts = new Map();
    for (const { terminal } of sessions) if (terminal) counts.set(terminal, (counts.get(terminal) ?? 0) + 1);
    const targets = new Map();
    if (this.platform !== 'win32' || !counts.size) return targets;
    try {
      const windows = this.windows()?.list((window) => isWindowsTerminal(window) && counts.get(window.title) === 1, false) ?? [];
      for (const window of windows) targets.set(window.title, targets.has(window.title) ? null : window.id);
    } catch { /* The project shell route is still available independently. */ }
    return targets;
  }

  snapshot() {
    let links = [];
    let message = '';
    try { links = this.config().links.map(({ id, name }) => ({ id, name })); } catch (error) { message = error.message; }
    const { status, sessions } = this.sessions();
    const terminals = this.terminalWindows(sessions);
    return { status, message, links, windowsDesktop: this.platform === 'win32',
      sessions: sessions.slice(0, 16).map(({ directory, terminal, ...session }) => ({ ...session,
        terminalAvailable: !!terminals.get(terminal), projectShellAvailable: this.platform === 'win32' && !!localWindowsDirectory(directory),
      })) };
  }

  async desktop() {
    if (this.platform !== 'win32') throw new Error('Claude Desktop discovery is available on Windows.');
    const target = this.config().desktop;
    const matches = (window) => window.executable?.toLowerCase() === 'claude.exe' &&
      (!target?.path || /\.lnk$/i.test(target.path) || window.path?.toLowerCase() === target.path.toLowerCase()) &&
      (!target?.appId || window.appId?.toLowerCase() === target.appId.toLowerCase());
    const windows = this.windows();
    if (matches(windows?.foreground({ appId: !!target?.appId, title: false }) ?? {})) return { ok: true };
    const candidates = windows?.list(matches, !!target?.appId) ?? [];
    if (candidates.length) {
      if (candidates.length === 1 && windows.focus(matches, candidates[0].id, !!target?.appId)) return { ok: true };
      throw new Error('Bring the Claude Desktop window to the foreground in Windows.');
    }
    if (target?.appId) return this.run({ type: 'launch', target: '%WINDIR%\\explorer.exe', args: [`shell:AppsFolder\\${target.appId}`] });
    if (target?.path) return this.run({ type: /\.lnk$/i.test(target.path) ? 'open' : 'launch', target: target.path });
    throw new Error('Start Claude Desktop or set its app ID or shortcut in Edit Claude settings.');
  }

  async change(command) {
    switch (command?.action) {
      case 'edit-config': return openMonitorConfig(this.file, 'Claude links', 'links', this.openConfig);
      case 'open-desktop': return this.desktop();
      case 'open-link': {
        const link = this.config().links.find(({ id }) => id === command.id);
        if (!link) throw new Error('This saved Claude chat is unavailable.');
        return this.run({ type: 'open', target: link.url });
      }
      case 'focus-terminal':
      case 'project-shell': {
        if (this.platform !== 'win32' || typeof command.session !== 'string' || !ID.test(command.session)) {
          throw new Error('This Claude Code session is unavailable.');
        }
        const { sessions } = this.sessions();
        const target = sessions.find((session) => session.session === command.session);
        if (!target) throw new Error('This Claude Code session is no longer active.');
        if (command.action === 'project-shell') {
          const directory = localWindowsDirectory(target.directory);
          if (!directory) throw new Error('A local Windows project directory is unavailable.');
          return this.run({ type: 'launch', target: 'wt.exe', args: ['new-tab', '--startingDirectory', directory] });
        }
        const windowId = this.terminalWindows(sessions).get(target.terminal);
        const matches = (window) => isWindowsTerminal(window) && window.title === target.terminal;
        if (!windowId || !this.windows()?.focus(matches, windowId, false)) {
          throw new Error('The linked Claude Code terminal is unavailable. Switch to its Windows Terminal tab and try again.');
        }
        return { ok: true };
      }
      default: throw new Error('Unknown Claude command.');
    }
  }
}

module.exports = { ClaudeView, chatUrl, normalizeClaudeConfig };
