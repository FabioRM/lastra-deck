// @ts-check
'use strict';

const work = require('../../profiles/work.json');
const meeting = require('../../profiles/meeting.json');
const streaming = require('../../profiles/streaming.json');
const gaming = require('../../profiles/gaming.json');
const { validateProfile } = require('./profile');
const { packs, packKeys } = require('./shortcut-packs');

const GRID = { cols: 8, rows: 3 };
const packById = new Map(packs.map((pack) => [pack.id, pack]));

function metrics(metric, column, shape = 'graph') {
  return { id: metric, type: 'system-metric', settings: { metric, shape },
    layout: { column, row: 1, cols: 2, rows: 1 } };
}

function fader(device, column) {
  return { id: device, type: 'audio-fader', settings: { device },
    layout: { column, row: 1, cols: 2, rows: 1 } };
}

function packPage(id, wanted, shortcutLanguage) {
  const pack = packById.get(id);
  const byId = new Map(packKeys(pack, { shortcutLanguage }).map((key) => [key.id, key]));
  const keys = wanted.map((name) => {
    const { id, label, icon, category, action, confirm } = byId.get(name);
    return { id, label, icon, category, action, ...(confirm ? { confirm } : {}) };
  });
  return { id: pack.id, name: pack.name, apps: pack.executables, appIds: pack.appIds, keys };
}

function withTargets(page) {
  if (!page.apps?.length) return page;
  function scope(action) {
    return action?.type === 'hotkey' && !action.targetApps && !action.shortcutGuard
      ? { ...action, targetApps: page.apps } : action;
  }
  return { ...page, keys: page.keys.map((key) => key ? {
    ...key, action: scope(key.action), ...(key.hold ? { hold: scope(key.hold) } : {}),
    ...(key.double ? { double: scope(key.double) } : {}),
  } : key) };
}

function makeTemplate(id, name, description, requirements, pages) {
  return { id, name, description, requirements, profile: validateProfile({ name, grid: GRID, pages: pages.map(withTargets) }) };
}

function profileTemplates(shortcutLanguage) {
  const [workHome, , workBrowser] = work.pages;
  const [meetingHome, meetingTeams, meetingZoom] = meeting.pages;
  const [streamingHome, streamingObs, streamingDiscord] = streaming.pages;
  const [gamingHome] = gaming.pages;
  const development = packPage('vscode', ['palette', 'quick-open', 'find-files', 'source-control', 'save', 'debug'], shortcutLanguage);
  const teams = packPage('teams', ['search', 'new-chat'], shortcutLanguage);
  const discord = packPage('discord', ['switcher', 'search'], shortcutLanguage);
  return [
    makeTemplate('work', 'Work', 'Windows tools, browser shortcuts and development keys.',
      ['The VS Code launch key uses the default per-user installation path.'],
      [{ ...workHome, widgets: [metrics('cpu', 0), metrics('ram', 2)] }, workBrowser, development]),
    makeTemplate('vscode', 'VS Code', 'Open files, navigate changes, search the workspace and debug.',
      ['Uses the Windows shortcuts for VS Code. The Terminal key requires US keyboard layout.'],
      [{ ...packPage('vscode', ['palette', 'quick-open', 'find-files', 'explorer', 'source-control', 'terminal', 'save', 'debug'], shortcutLanguage),
        widgets: [metrics('cpu', 0), metrics('ram', 2)] }]),
    makeTemplate('meetings', 'Meetings', 'Windows audio controls with dedicated Teams and Zoom pages.',
      ['The speaker and microphone controls follow Windows endpoints.'],
      [{ ...meetingHome, widgets: [fader('output', 0), fader('microphone', 2)] },
        { ...meetingTeams, keys: [...meetingTeams.keys.slice(0, 2), ...teams.keys] }, meetingZoom]),
    makeTemplate('streaming', 'Streaming', 'Open OBS, control local audio and find conversations in Discord.',
      ['The OBS panel provides scene and stream controls after you configure OBS in Lastra.'],
      [{ ...streamingHome, widgets: [fader('output', 0), fader('microphone', 2)] },
        streamingObs, { ...streamingDiscord, keys: [...discord.keys, ...streamingDiscord.keys.slice(2)] }]),
    makeTemplate('editing', 'Video and image editing', 'Contextual pages for Photoshop, Premiere and DaVinci Resolve.',
      ['Editing shortcuts follow the active Windows app and wait for the required workspace or timeline mode.'],
      [packPage('photoshop', ['layer-copy', 'transform', 'select-all', 'deselect', 'new-layer', 'fit-on-screen', 'actual-pixels', 'shortcuts'], shortcutLanguage),
        packPage('premiere', ['add-edit', 'save', 'import', 'shortcuts'], shortcutLanguage),
        packPage('davinci', ['save', 'keyboard', 'split'], shortcutLanguage)]),
    makeTemplate('sim-racing', 'Sim racing', 'Local audio, Game Bar, SimHub and system readings for a cockpit.',
      ['The SimHub key uses its default installation path. Set simulator-specific pit and radio bindings in the editor.'],
      [{ ...gamingHome, id: 'cockpit', name: 'Sim cockpit', keys: [
        ...gamingHome.keys,
        { id: 'simhub', label: 'SimHub', icon: 'gauge', action: { type: 'launch', target: '%ProgramFiles(x86)%\\SimHub\\SimHubWPF.exe' } },
        { id: 'sound', label: 'Sound settings', icon: 'sliders-horizontal', action: { type: 'open', target: 'ms-settings:sound' } },
      ], widgets: [fader('output', 0), fader('microphone', 2), metrics('cpu', 4, 'gauge'), metrics('gpu', 6, 'gauge')] }]),
  ];
}

module.exports = { profileTemplates };
