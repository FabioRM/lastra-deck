// @ts-check
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const electron = require('electron');
const ffmpeg = process.env.LASTRA_FFMPEG || 'ffmpeg';

function run(program, args) {
  const result = spawnSync(program, args, { cwd: root, stdio: 'inherit', windowsHide: true });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${program} exited with code ${result.status ?? result.signal}.`);
}

function preview(file, ...args) {
  run(electron, [root, `--user-data-dir=${path.join(path.dirname(file), 'electron')}`, `--preview=${file}`, ...args]);
}

function animation(file, ...args) {
  const directory = path.dirname(file);
  const frames = path.join(directory, path.basename(file, '.gif'));
  run(electron, [root, `--user-data-dir=${path.join(directory, 'electron')}`, `--preview-frames=${frames}`, ...args]);
  const manifest = JSON.parse(fs.readFileSync(path.join(frames, 'frames.json'), 'utf8'));
  const concat = path.join(frames, 'concat.txt');
  const fileLine = ({ file }) => `file '${file}'`;
  fs.writeFileSync(concat, [...manifest.flatMap((frame) => [fileLine(frame), `duration ${frame.seconds}`]), fileLine(manifest.at(-1))].join('\n') + '\n');
  const duration = manifest.reduce((sum, { seconds }) => sum + seconds, 0);
  run(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-f', 'concat', '-i', concat,
    '-filter_complex', 'fps=12,scale=1536:432:flags=lanczos,split[a][b];[a]palettegen=stats_mode=diff[p];[b][p]paletteuse=dither=sierra2_4a:diff_mode=rectangle',
    '-loop', '0', '-t', duration.toFixed(2), file]);
  return frames;
}

function refresh() {
  const temporaryRoot = fs.realpathSync(os.tmpdir());
  const staging = fs.mkdtempSync(path.join(temporaryRoot, 'lastra-previews-'));
  try {
    preview(path.join(staging, 'preview-home.png'));
    preview(path.join(staging, 'preview-vscode.png'), '--preview-pack=vscode');
    preview(path.join(staging, 'preview-states.png'), '--preview-states', `--preview-toolbar=${path.join(staging, 'preview-toolbar.png')}`);
    preview(path.join(staging, 'preview-portrait.png'), '--preview-states', '--preview-portrait',
      `--preview-toolbar=${path.join(staging, 'preview-toolbar-portrait.png')}`);
    preview(path.join(staging, 'preview-stats.png'), '--verify-stats-layout');
    preview(path.join(staging, 'preview-tools.png'), '--preview-states', '--preview-tools');
    preview(path.join(staging, 'preview-pomodoro-break.png'), '--preview-states', '--preview-break');
    preview(path.join(staging, 'preview-break-portrait.png'), '--preview-portrait', '--preview-break');

    const example = path.join(staging, 'shortcut-layout.json');
    fs.writeFileSync(example, JSON.stringify({
      version: 2, name: 'Lastra demo', grid: { cols: 8, rows: 3 },
      pages: [{ id: 'home', name: 'Home', keys: [] }],
      shortcutLayouts: {
        chrome: { enabled: true, pages: [
          { id: 'navigation', name: 'Navigation', shortcuts: [
            { id: 'new-tab' }, { id: 'address' }, { id: 'reload' }, { id: 'downloads' }, { id: 'find', hidden: true },
          ] },
          { id: 'tabs', name: 'Tab management', shortcuts: [
            { id: 'restore-tab' }, { id: 'previous-tab' }, { id: 'next-tab' }, { id: 'close-tab' },
          ] },
        ] },
      },
    }));
    const shortcuts = ['--preview-pack=chrome', `--profile=${example}`];
    preview(path.join(staging, 'preview-shortcuts.png'), ...shortcuts);
    const demo = animation(path.join(staging, 'preview-demo.gif'), '--preview-states');
    fs.copyFileSync(path.join(demo, 'dashboard.png'), path.join(staging, 'preview-dashboard.png'));
    animation(path.join(staging, 'preview-shortcuts.gif'), ...shortcuts);
    animation(path.join(staging, 'preview-tools.gif'), '--preview-states', '--preview-break');

    for (const file of ['preview-home.png', 'preview-vscode.png', 'preview-dashboard.png', 'preview-states.png',
      'preview-portrait.png', 'preview-stats.png', 'preview-shortcuts.png',
      'preview-toolbar.png', 'preview-tools.png', 'preview-pomodoro-break.png',
      'preview-demo.gif', 'preview-shortcuts.gif', 'preview-tools.gif']) {
      fs.copyFileSync(path.join(staging, file), path.join(root, 'docs', file));
      if (file.endsWith('.png')) fs.copyFileSync(path.join(staging, file), path.join(root, file));
    }
  } finally {
    if (path.dirname(staging) === temporaryRoot && path.basename(staging).startsWith('lastra-previews-')) {
      fs.rmSync(staging, { recursive: true, force: true });
    }
  }
}

try { refresh(); }
catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
