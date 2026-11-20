// @ts-check
'use strict';

const { readMonitorConfig, openMonitorConfig } = require('./monitoring-config');

const APP_IDS = new Set(['openai.chatgpt-desktop_2p2nqsd0c76g0!app', 'openai.codex_2p2nqsd0c76g0!app']);
const APP = 'chatgpt.exe';
const ENTRY_ID = /^[a-z0-9_-]{1,48}$/;
const CHAT_ID = '[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}';
const CHAT_PATH = new RegExp('^/(?:c|share)/' + CHAT_ID + '/?$', 'i');
const PROJECT_PATH = new RegExp('^/g/g-p-[0-9a-f]{32}(?:-[a-z0-9-]{1,140})?/(?:project|c/' + CHAT_ID + ')/?$', 'i');

function chatGptLink(value) {
  if (typeof value !== 'string' || value.length > 2048 || /[\u0000-\u001f\u007f]/.test(value)) return null;
  let url;
  try { url = new URL(value); } catch { return null; }
  if (url.protocol !== 'https:' || !['chatgpt.com', 'chat.openai.com'].includes(url.host) || url.username || url.password) return null;
  const kind = PROJECT_PATH.test(url.pathname) ? 'Project' : CHAT_PATH.test(url.pathname) ? 'Chat' : null;
  return kind ? { url: 'https://chatgpt.com' + url.pathname.replace(/\/$/, ''), kind } : null;
}

function normalizeChatGptLinks(raw) {
  if (raw?.version !== 1 || !Array.isArray(raw.links) || raw.links.length > 32) {
    throw new Error('Use version 1 and a list of up to 32 ChatGPT links.');
  }
  const seen = new Set();
  return raw.links.map((item, index) => {
    const label = 'ChatGPT link ' + (index + 1);
    const name = typeof item?.name === 'string' ? item.name.trim() : '';
    const link = chatGptLink(item?.url);
    if (typeof item?.id !== 'string' || !ENTRY_ID.test(item.id) || seen.has(item.id)) throw new Error(label + ' needs a unique lowercase ID.');
    if (!name || name.length > 80 || /[\u0000-\u001f\u007f]/.test(name) || !link) {
      throw new Error(label + ' needs a name and a ChatGPT chat or Project link.');
    }
    seen.add(item.id);
    return { id: item.id, name, ...link };
  });
}

function isChatGptWindow(window) {
  return window?.executable?.toLowerCase() === APP && APP_IDS.has(window.appId?.toLowerCase());
}

class ChatGptView {
  constructor(file, { platform = process.platform, openConfig, run, windows = () => null, snippets }) {
    this.file = file;
    this.platform = platform;
    this.openConfig = openConfig;
    this.run = run;
    this.windows = windows;
    this.snippets = snippets;
  }

  readLinks() {
    return readMonitorConfig(this.file, 'saved ChatGPT links', normalizeChatGptLinks);
  }

  snapshot() {
    let links = [];
    let message = null;
    try { links = this.readLinks().map(({ id, name, kind }) => ({ id, name, kind })); }
    catch (err) { message = err.message; }
    return { links, message, prompts: this.snippets.snapshot('prompt'), windowsApp: this.platform === 'win32' };
  }

  async openCompanion() {
    const windows = this.platform === 'win32' && this.windows();
    if (!windows) throw new Error('The companion shortcut is available in the ChatGPT Windows app.');
    const description = { appId: true, title: false };
    let expected = windows.foreground(description);
    if (!isChatGptWindow(expected)) {
      const candidates = windows.list(isChatGptWindow, true);
      if (!candidates.length) throw new Error('Open the ChatGPT Windows app first.');
      if (candidates.length !== 1 || !windows.focus(isChatGptWindow, candidates[0].id, true)) {
        throw new Error('Bring the ChatGPT Windows app to the foreground and try again.');
      }
      expected = windows.foreground(description);
      if (!isChatGptWindow(expected) || expected.id !== candidates[0].id) {
        throw new Error('Bring the ChatGPT Windows app to the foreground and try again.');
      }
    }
    const guard = () => {
      const active = windows.foreground(description);
      if (!expected.id || !isChatGptWindow(active) || active.id !== expected.id || active.path !== expected.path) {
        return 'The ChatGPT window changed before the companion shortcut could run.';
      }
    };
    return this.run({ type: 'hotkey', keys: 'Alt+Space', targetApps: [APP] }, [], { guard });
  }

  async change(command) {
    if (command?.action === 'open-companion') return this.openCompanion();
    if (command?.action === 'edit-links') return openMonitorConfig(this.file, 'saved ChatGPT links', 'links', this.openConfig);
    if (command?.action === 'open-link') {
      const entry = this.readLinks().find(({ id }) => id === command.id);
      if (!entry) throw new Error('This ChatGPT link is unavailable.');
      return this.run({ type: 'open', target: entry.url });
    }
    return this.snippets.change(command, 'prompt');
  }
}

module.exports = { ChatGptView, chatGptLink, normalizeChatGptLinks, isChatGptWindow };
