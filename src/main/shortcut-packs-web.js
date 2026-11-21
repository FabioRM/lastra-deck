// @ts-check
'use strict';

const { createHash } = require('node:crypto');
const { withShortcutWorkflows } = require('./shortcut-pack-data');

const docs = (name) => ({ host: 'docs.google.com', prefix: '/' + name + '/' });
const browserExecutables = new Set(['chrome.exe', 'msedge.exe', 'brave.exe', 'arc.exe', 'vivaldi.exe']);
const idPattern = /(?:^|\.)_crx_([a-p]{32})(?:\.|$)/i;
const docsEditor = { mode: 'the Google Docs document editor' };
const sheetsEditor = { mode: 'the Google Sheets spreadsheet editor' };
const slidesEditor = { mode: 'the Google Slides presentation editor' };
const canvaEditor = { mode: 'a Canva design' };
const miroBoard = { mode: 'a Miro board' };
const photoshopEditor = { mode: 'the Photoshop web editor' };
/** @type {import('./shortcut-pack-data').ShortcutPack[]} */
const webPacks = withShortcutWorkflows([
  { id: 'gdocs', name: 'Google Docs', sites: [docs('document')], editingMode: docsEditor.mode,
    manifests: ['https://docs.google.com/document/'],
    source: 'https://support.google.com/docs/answer/179738', keys: [
      ['find', 'Find in document', 'search', 'Ctrl+F', docsEditor],
      ['undo', 'Undo', 'undo-2', 'Ctrl+Z', docsEditor],
      ['redo', 'Redo', 'redo-2', 'Ctrl+Shift+Z', docsEditor],
      ['shortcuts', 'Keyboard shortcuts', 'keyboard', 'Ctrl+/', { usLayout: true, notation: 'Ctrl+/' }],
    ] },
  { id: 'gsheets', name: 'Google Sheets', sites: [docs('spreadsheets')], editingMode: sheetsEditor.mode,
    manifests: ['https://docs.google.com/spreadsheets/'],
    source: 'https://support.google.com/docs/answer/181110', keys: [
      ['find', 'Find in sheet', 'search', 'Ctrl+F', sheetsEditor],
      ['insert-sheet', 'Insert sheet', 'table-2', 'Shift+F11', sheetsEditor],
      ['undo', 'Undo', 'undo-2', 'Ctrl+Z', sheetsEditor],
    ] },
  { id: 'google-slides', name: 'Google Slides', sites: [docs('presentation')], editingMode: slidesEditor.mode,
    manifests: ['https://docs.google.com/presentation/'],
    source: 'https://support.google.com/docs/answer/1696717', keys: [
      ['new-slide', 'New slide', 'square-plus', 'Ctrl+M', slidesEditor],
      ['undo', 'Undo', 'undo-2', 'Ctrl+Z', slidesEditor],
      ['shortcuts', 'Keyboard shortcuts', 'keyboard', 'Ctrl+/', { usLayout: true, notation: 'Ctrl+/' }],
    ] },
  { id: 'gmail', name: 'Gmail', sites: [{ host: 'mail.google.com' }],
    manifests: ['https://mail.google.com/mail/', 'https://mail.google.com/mail/u/0/'],
    source: 'https://support.google.com/mail/answer/6594', keys: [
      ['search', 'Search mail', 'search', '/', { usLayout: true, notation: '/', mode: 'the Gmail message list with shortcuts enabled' }],
      ['shortcuts', 'Keyboard shortcuts', 'keyboard', 'char:?', { usLayout: true, notation: '?' }],
    ] },
  { id: 'google-meet', name: 'Google Meet', sites: [{ host: 'meet.google.com' }],
    manifests: ['https://meet.google.com/'],
    source: 'https://support.google.com/a/users/answer/9896256', keys: [
      ['mic', 'Toggle mic', 'mic', 'Ctrl+D', { mode: 'an active Google Meet call' }],
      ['camera', 'Toggle camera', 'video', 'Ctrl+E', { mode: 'an active Google Meet call' }],
      ['shortcuts', 'Keyboard shortcuts', 'keyboard', 'char:?', { usLayout: true, notation: '?' }],
    ] },
  { id: 'youtube', name: 'YouTube', sites: [{ host: 'www.youtube.com' }, { host: 'youtube.com' }],
    manifests: ['https://www.youtube.com/?feature=ytca', 'https://www.youtube.com/'],
    source: 'https://support.google.com/youtube/answer/7631406', keys: [
      ['play', 'Play or pause', 'circle-play', 'K', { mode: 'the YouTube player' }],
      ['back', 'Back 10 seconds', 'rewind', 'J', { mode: 'the YouTube player' }],
      ['forward', 'Forward 10 seconds', 'fast-forward', 'L', { mode: 'the YouTube player' }],
      ['shortcuts', 'Keyboard shortcuts', 'keyboard', 'char:?', { usLayout: true, notation: '?' }],
    ] },
  { id: 'trello', name: 'Trello', sites: [{ host: 'trello.com' }], manifests: ['https://trello.com/'],
    source: 'https://support.atlassian.com/trello/docs/keyboard-shortcuts-in-trello/', keys: [
      ['boards', 'Find a board', 'panels-top-left', 'B', { mode: 'a Trello board' }],
      ['search', 'Search', 'search', '/', { usLayout: true, notation: '/', mode: 'a Trello board' }],
      ['shortcuts', 'Keyboard shortcuts', 'keyboard', 'char:?', { usLayout: true, notation: '?' }],
    ] },
  { id: 'jira', name: 'Jira Cloud', sites: [{ subdomain: 'atlassian.net', prefix: '/jira/' }], manifests: [],
    manifestExample: 'https://your-team.atlassian.net/jira/your-work',
    source: 'https://support.atlassian.com/jira-software-cloud/docs/what-is-the-command-palette/', keys: [
      ['palette', 'Command palette', 'command', 'Ctrl+K'],
      ['search', 'Search work items', 'search', '/', { usLayout: true, notation: '/', mode: 'a Jira work view' }],
    ] },
  { id: 'asana', name: 'Asana', sites: [{ host: 'app.asana.com' }], manifests: ['https://app.asana.com/'],
    source: 'https://help.asana.com/s/article/keyboard-shortcuts', keys: [
      ['shortcuts', 'Keyboard shortcuts', 'keyboard', 'Ctrl+/', { usLayout: true, notation: 'Ctrl+/' }],
    ] },
  { id: 'canva', name: 'Canva', sites: [{ host: 'www.canva.com' }, { host: 'canva.com' }], editingMode: canvaEditor.mode,
    manifests: ['https://www.canva.com/'], source: 'https://www.canva.com/help/canva-keyboard-shortcuts/', keys: [
      ['undo', 'Undo', 'undo-2', 'Ctrl+Z', canvaEditor],
      ['redo', 'Redo', 'undo-2', 'Ctrl+Shift+Z', canvaEditor],
      ['duplicate', 'Duplicate selection', 'copy', 'Ctrl+D', canvaEditor],
    ] },
  { id: 'linear', name: 'Linear', sites: [{ host: 'linear.app' }], manifests: ['https://linear.app/'],
    source: 'https://linear.app/docs/search', keys: [
      ['palette', 'Command palette', 'command', 'Ctrl+K'],
      ['filter', 'Find in view', 'search', 'Ctrl+F'],
      ['new-issue', 'New issue draft', 'square-plus', 'C', { mode: 'a Linear issue view' }],
    ] },
  { id: 'miro', name: 'Miro', sites: [{ host: 'miro.com' }], manifests: ['https://miro.com/'], editingMode: miroBoard.mode,
    source: 'https://help.miro.com/hc/en-us/articles/360017731033-Shortcuts-and-hotkeys', keys: [
      ['shortcuts', 'Keyboard shortcuts', 'keyboard', 'F1'],
      ['search', 'Find on board', 'search', 'Ctrl+F', miroBoard],
      ['undo', 'Undo', 'undo-2', 'Ctrl+Z', miroBoard],
    ] },
  { id: 'photoshop-web', name: 'Photoshop on the web', sites: [{ host: 'photoshop.adobe.com' }], editingMode: photoshopEditor.mode,
    manifests: ['https://photoshop.adobe.com/'],
    source: 'https://helpx.adobe.com/photoshop/web/get-set-up/preferences-and-settings/keyboard-shortcuts.html', keys: [
      ['transform', 'Transform', 'scaling', 'Ctrl+Alt+T', photoshopEditor],
      ['layer-copy', 'Layer via copy', 'layers-2', 'Ctrl+J', photoshopEditor],
      ['zoom-fit', 'Zoom to fit', 'maximize', 'Ctrl+0', photoshopEditor],
      ['undo', 'Undo', 'undo-2', 'Ctrl+Z', photoshopEditor],
    ] },
  ...require('./shortcut-packs-web-popular'),
  ...require('./shortcut-packs-web-work'),
  ...require('./shortcut-packs-web-more'),
  ...require('./shortcut-packs-web-workspaces'),
  ...require('./shortcut-packs-web-service-tools'),
  ...require('./shortcut-packs-web-engineering'),
  ...require('./shortcut-packs-web-specialists'),
], require('./shortcut-pack-web-workflows'));

const byPack = new Map(webPacks.map((pack) => [pack.id, pack]));

// Chromium double-hashes the canonical manifest ID and encodes its first 16 bytes a–p.
function chromiumWebAppId(manifestId) {
  const digest = createHash('sha256').update(manifestId).digest();
  return createHash('sha256').update(digest).digest('hex').slice(0, 32)
    .replace(/[0-9a-f]/g, (hex) => String.fromCharCode(97 + Number.parseInt(hex, 16)));
}

function manifestFor(pack, value) {
  if (!pack || typeof value !== 'string' || value.length > 512) return null;
  let url;
  try { url = new URL(value); } catch { return null; }
  if (url.protocol !== 'https:' || url.port || url.username || url.password) return null;
  if (!pack.sites.some(({ host, subdomain, prefix }) =>
    (host ? url.hostname === host : url.hostname.endsWith('.' + subdomain))
    && (!prefix || url.pathname === prefix.slice(0, -1) || url.pathname.startsWith(prefix)))) return null;
  url.hash = '';
  return url.href;
}

function normalizeWebApp(value) {
  const pack = byPack.get(value?.pack);
  const manifestId = manifestFor(pack, value?.manifestId);
  if (!manifestId) throw new Error('The manifest ID must be a supported HTTPS address for this app.');
  return { pack: pack.id, manifestId };
}

const defaultApps = new Map(webPacks.flatMap((pack) => pack.manifests.map((id) => /** @type {[string, typeof pack]} */ ([chromiumWebAppId(id), pack]))));

function installId(context) {
  return browserExecutables.has(context?.executable) ? idPattern.exec(context.appId ?? '')?.[1]?.toLowerCase() : undefined;
}

function installedWebPack(context, configured = []) {
  const id = installId(context);
  if (!id) return null;
  const custom = configured.find(({ manifestId }) => chromiumWebAppId(manifestId) === id);
  return (custom ? byPack.get(custom.pack) : defaultApps.get(id)) ?? null;
}

function isInstalledWebApp(context) { return Boolean(installId(context)); }

module.exports = { webPacks, isInstalledWebApp, installedWebPack, normalizeWebApp, chromiumWebAppId };
