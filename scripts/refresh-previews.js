// @ts-check
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const electron = require('electron');
const { LOOK_PRESETS, THEMES } = require('../src/shared/appearance');
const ffmpeg = process.env.LASTRA_FFMPEG || 'ffmpeg';

// Deck Keys in each quick look on one theme, then in each theme with the default look. The site's gallery shows them.
const GALLERY = [
  ...Object.entries(LOOK_PRESETS).map(([id, preset]) => ({ name: 'look-' + id, settings: { theme: 'dark', ...preset } })),
  ...Object.keys(THEMES).filter((id) => id !== 'system').map((id) => ({ name: 'theme-' + id, settings: { theme: id } })),
];
// The themes animation pairs themes with quick looks. The plain themes keep their own look.
const TOUR = [
  { theme: 'dark', ...LOOK_PRESETS.glow }, { theme: 'midnight', ...LOOK_PRESETS.glass },
  { theme: 'ocean', ...LOOK_PRESETS.bold }, { theme: 'graphite', ...LOOK_PRESETS.blueprint },
  { theme: 'ember', ...LOOK_PRESETS.glow }, { theme: 'plum', ...LOOK_PRESETS.glass },
  { theme: 'forest', ...LOOK_PRESETS.classic }, { theme: 'sand', ...LOOK_PRESETS.glow },
  { theme: 'minimal-light' }, { theme: 'contrast-dark' },
];

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
}

/**
 * Appearance settings as a `--preview-look` argument. A preset's display name is not a setting.
 * @param {Record<string, string>} settings
 */
function look(settings) {
  return '--preview-look=' + Object.entries(settings).filter(([setting]) => setting !== 'name')
    .map(([setting, value]) => `${setting}=${value}`).join(',');
}

/** Renders the gallery at half size as WebP, which keeps eighteen pictures light, and returns the names of the files it wrote. */
function lookGallery(directory) {
  return GALLERY.map(({ name, settings }) => {
    const full = path.join(directory, name + '-full.png');
    preview(full, look(settings));
    const file = `preview-${name}.webp`;
    run(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', '-i', full, '-vf', 'scale=1280:360:flags=lanczos',
      '-c:v', 'libwebp', '-quality', '88', path.join(directory, file)]);
    return file;
  });
}

function themesAnimation(file) {
  const directory = path.dirname(file);
  for (const [index, settings] of TOUR.entries()) preview(path.join(directory, `tour-${index}.png`), look(settings));
  // Every theme has its own colors, so each frame gets its own palette.
  run(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-framerate', '2/3', '-start_number', '0',
    '-i', path.join(directory, 'tour-%d.png'),
    '-filter_complex', 'scale=1280:360:flags=lanczos,split[a][b];[a]palettegen=stats_mode=single[p];[b][p]paletteuse=new=1:dither=bayer:bayer_scale=4',
    '-loop', '0', file]);
}

function appFocusAnimation(file) {
  const directory = path.dirname(file);
  const packs = ['claude', 'chatgpt-codex', 'chrome', 'explorer', 'photoshop'];
  for (const [index, pack] of packs.entries()) {
    preview(path.join(directory, `focus-${index}.png`), `--preview-pack=${pack}`);
  }
  run(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-framerate', '2/5', '-start_number', '0',
    '-i', path.join(directory, 'focus-%d.png'),
    '-filter_complex', 'crop=1520:672:48:24,split[a][b];[a]palettegen[p];[b][p]paletteuse=dither=sierra2_4a:diff_mode=rectangle',
    '-loop', '0', file]);
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
    animation(path.join(staging, 'preview-demo.gif'), '--preview-states');
    // The demo's Dashboard frame doubles as the Dashboard picture.
    fs.copyFileSync(path.join(staging, 'preview-demo', 'dashboard.png'), path.join(staging, 'preview-dashboard.png'));
    animation(path.join(staging, 'preview-shortcuts.gif'), ...shortcuts);
    animation(path.join(staging, 'preview-tools.gif'), '--preview-states', '--preview-break');
    appFocusAnimation(path.join(staging, 'preview-app-focus.gif'));
    themesAnimation(path.join(staging, 'preview-themes.gif'));
    const gallery = lookGallery(staging);

    for (const file of [...gallery, 'preview-home.png', 'preview-dashboard.png', 'preview-vscode.png', 'preview-themes.gif', 'preview-states.png', 'preview-portrait.png', 'preview-stats.png', 'preview-shortcuts.png',
      'preview-toolbar.png', 'preview-tools.png', 'preview-pomodoro-break.png',
      'preview-demo.gif', 'preview-shortcuts.gif', 'preview-tools.gif', 'preview-app-focus.gif']) {
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
