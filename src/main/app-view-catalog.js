// @ts-check
'use strict';

const fs = require('node:fs');
const { expandEnv } = require('./actions');

const open = (id, label, target) => ({ id, label, action: { type: 'open', target } });

const dockerDesktop = {
  id: 'app', label: 'Open Docker Desktop',
  get action() {
    const machine = '%ProgramFiles%\\Docker\\Docker\\Docker Desktop.exe';
    const local = '%LocalAppData%\\Programs\\DockerDesktop\\Docker Desktop.exe';
    const target = [machine, local].map((item) => expandEnv(item)).find((item) => fs.existsSync(item)) ?? machine;
    return { type: 'launch', target };
  },
};

const BUILT_IN_APP_VIEWS = [
  {
    id: 'claude', name: 'Claude and Claude Code', category: 'AI', icon: 'sparkles',
    summary: 'Open Claude and saved chats. Follow local Claude Code sessions and approval prompts.',
    matches: ['claude.exe'], provider: 'claude',
    commands: [
      open('web', 'Open Claude', 'https://claude.ai/'),
      open('guide', 'Claude Code guide', 'https://code.claude.com/docs/'),
    ],
    capabilities: [{ label: 'Claude Code activity', status: 'Optional hooks', detail: 'Enable local hooks for live activity and status-line readings. Review approvals in Claude Code.' }],
  },
  {
    id: 'vscode', name: 'Visual Studio Code', category: 'Development', icon: 'code',
    summary: 'See workspace context and run configured VS Code tasks.',
    matches: ['code.exe', 'code-insiders.exe', 'code - insiders.exe'], provider: 'vscode',
    commands: [
      open('app', 'Open VS Code', 'vscode://'),
      open('guide', 'VS Code documentation', 'https://code.visualstudio.com/docs'),
    ],
    capabilities: [{ label: 'Workspace state', status: 'Local extension', detail: 'Enable Lastra for VS Code to see workspace data.' }],
  },
  {
    id: 'chatgpt', name: 'ChatGPT', category: 'AI', icon: 'message-circle',
    summary: 'Open the Windows companion, saved chats, and Projects. Preview and copy reusable prompts.',
    matches: ['chatgpt.exe'], provider: 'chatgpt',
    commands: [open('web', 'Open ChatGPT', 'https://chatgpt.com/')],
    capabilities: [
      { label: 'Saved links', status: 'Local', detail: 'Private chats and Projects open in your signed-in browser.' },
      { label: 'API workflows', status: 'Separate connection', detail: 'Live ChatGPT account data is unavailable in this view.' },
    ],
  },
  {
    id: 'spotify', name: 'Spotify', category: 'Media', icon: 'music',
    summary: 'Control Spotify desktop playback and open your saved playlists.',
    matches: ['spotify.exe'],
    provider: 'spotify',
    commands: [
      open('app', 'Open Spotify app', 'spotify:'),
      open('web', 'Open web player', 'https://open.spotify.com/'),
    ],
    capabilities: [{
      label: 'Spotify Connect', status: 'Optional connection',
      detail: 'Playback devices and queue controls depend on your authorized Spotify connection. The Windows media widget is available separately.',
    }],
    widgets: [{
      id: 'spotify-playing', type: 'spotify', settings: { appearance: 'expanded' },
      layout: { column: 0, row: 0, cols: 4, rows: 1 },
    }],
  },
  {
    id: 'netflix', name: 'Netflix', category: 'Media', icon: 'film',
    summary: 'Open Netflix and your saved titles in a supported player.',
    matches: [], provider: 'netflix',
    commands: [open('web', 'Open Netflix in browser', 'https://www.netflix.com/')],
    capabilities: [{
      label: 'Playback', status: 'Windows media',
      detail: 'Live controls require an identified Netflix session. Browser playback stays in the Netflix player.',
    }],
    widgets: [{ id: 'netflix-playing', type: 'netflix', settings: { appearance: 'expanded' },
      layout: { column: 0, row: 0, cols: 4, rows: 1 } }],
  },
  {
    id: 'streaming-watchlist', name: 'Streaming watchlist', category: 'Media', icon: 'list-video',
    summary: 'Open saved titles across streaming services.',
    matches: [], provider: 'streaming-watchlist', commands: [], capabilities: [],
    widgets: [{ id: 'watchlist-playing', type: 'now-playing', settings: { appearance: 'expanded' },
      layout: { column: 0, row: 0, cols: 4, rows: 1 } }],
  },
  {
    id: 'docker', name: 'Docker', category: 'Development', icon: 'boxes',
    summary: 'Inspect local Docker containers and Compose projects.',
    matches: ['docker desktop.exe'],
    provider: 'docker',
    commands: [
      dockerDesktop,
      open('guide', 'Docker Desktop guide', 'https://docs.docker.com/desktop/'),
    ],
    capabilities: [],
  },
  {
    id: 'wsl', name: 'Windows Subsystem for Linux', category: 'Development', icon: 'terminal',
    summary: 'See distributions and open a Linux workspace.',
    matches: ['wsl.exe'],
    provider: 'wsl',
    commands: [open('guide', 'WSL command reference', 'https://learn.microsoft.com/windows/wsl/basic-commands')],
    capabilities: [],
  },
  {
    id: 'terminal', name: 'Windows Terminal', category: 'Development', icon: 'terminal',
    summary: 'Open a shell in a project directory or run a pinned command.',
    matches: ['windowsterminal.exe', 'windowsterminalpreview.exe'],
    provider: 'terminal', commands: [], capabilities: [],
  },
  {
    id: 'projects', name: 'Projects', category: 'Development', icon: 'folder-git-2',
    summary: 'Open the repository, issues, terminal, and documentation for a configured project.',
    matches: [], provider: 'projects', commands: [], capabilities: [],
  },
  {
    id: 'workspaces', name: 'Workspaces', category: 'Windows', icon: 'layout-grid',
    summary: 'Open a saved group of apps and restore their window positions.',
    matches: [], provider: 'workspaces', commands: [], capabilities: [],
  },
  {
    id: 'github-checks', name: 'GitHub checks', category: 'Development', icon: 'git-pull-request',
    summary: 'See workflow results and open pull requests in configured public repositories.',
    matches: [], provider: 'github-checks', commands: [], capabilities: [],
  },
  {
    id: 'audio-presets', name: 'Audio presets', category: 'Windows', icon: 'sliders-horizontal',
    summary: 'Save and review the Windows speaker and microphone levels for each activity.',
    matches: [], provider: 'audio-presets', commands: [], capabilities: [],
  },
  {
    id: 'service-health', name: 'Service health', category: 'Monitoring', icon: 'activity',
    summary: 'Track recent availability for services you configure.', matches: [], provider: 'service-health',
    commands: [], capabilities: [],
  },
  {
    id: 'syncthing', name: 'Syncthing', category: 'Monitoring', icon: 'refresh-cw',
    summary: 'See selected folder progress and local Syncthing device connections.', matches: [], provider: 'syncthing',
    commands: [], capabilities: [],
  },
  {
    id: 'prometheus', name: 'Prometheus', category: 'Monitoring', icon: 'chart-line',
    summary: 'Read configured metrics by host and service.', matches: [], provider: 'prometheus',
    commands: [], capabilities: [],
  },
  {
    id: 'alerts', name: 'Alert inbox', category: 'Monitoring', icon: 'bell',
    summary: 'Review current alerts and recent recoveries.', matches: [], provider: 'alerts',
    commands: [], capabilities: [],
  },
  {
    id: 'kubernetes', name: 'Kubernetes', category: 'Development', icon: 'boxes',
    summary: 'Inspect pods, deployment rollouts and recent logs in configured namespaces.', matches: [],
    provider: 'kubernetes', commands: [], capabilities: [],
  },
  {
    id: 'hardware-thresholds', name: 'Hardware thresholds', category: 'Monitoring', icon: 'thermometer',
    summary: 'Alert on sustained load or temperature readings.', matches: [], provider: 'hardware-thresholds',
    commands: [], capabilities: [],
  },
  {
    id: 'resources', name: 'Lastra resources', category: 'Monitoring', icon: 'gauge',
    summary: 'Check CPU and working set memory for Lastra and its managed helpers.',
    matches: [], provider: 'resources', commands: [], capabilities: [],
  },
  {
    id: 'power', name: 'Battery and power', category: 'Monitoring', icon: 'battery-charging',
    summary: 'View battery charge, runtime, and recent power changes.',
    matches: [], provider: 'power', commands: [], capabilities: [],
  },
  {
    id: 'watchlist', name: 'Monitoring watchlist', category: 'Monitoring', icon: 'chart-no-axes-combined',
    summary: 'Pin hardware readings, app usage, and service checks.',
    matches: [], provider: 'watchlist', commands: [], capabilities: [],
  },
  {
    id: 'action-history', name: 'Action history', category: 'Lastra', icon: 'history',
    summary: 'Review deck key and app command results from this session.', matches: [], provider: 'action-history',
    commands: [], capabilities: [],
  },
  {
    id: 'agent-activity', name: 'Agent activity', category: 'Lastra', icon: 'activity',
    summary: 'See runs, progress, and wait reasons reported by authorized agents.',
    matches: [], provider: 'agent-activity', commands: [], capabilities: [],
  },
  {
    id: 'notes', name: 'Notes and checklists', category: 'Productivity', icon: 'notebook-pen',
    summary: 'Keep local notes and short task lists on the deck.', matches: [], provider: 'notes',
    commands: [], capabilities: [],
  },
  {
    id: 'clipboard-pins', name: 'Pinned clipboard', category: 'Productivity', icon: 'pin',
    summary: 'Keep selected clipboard text in a fixed order.', matches: [], provider: 'clipboard-pins',
    commands: [], capabilities: [],
  },
  {
    id: 'snippets', name: 'Snippet library', category: 'Productivity', icon: 'clipboard-list',
    summary: 'Reusable prompts, replies, and text.',
    matches: [], provider: 'snippets', commands: [], capabilities: [],
  },
  {
    id: 'web-embeds', name: 'Web embeds', category: 'Media', icon: 'globe',
    summary: 'Open approved webpages and official Spotify embeds.', matches: [], provider: 'web-embeds',
    commands: [], capabilities: [],
  },
];

module.exports = { BUILT_IN_APP_VIEWS };
