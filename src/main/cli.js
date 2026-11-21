// @ts-check
'use strict';

const path = require('node:path');

/**
 * @typedef {object} LaunchOptions
 * @property {boolean} windowed Open a focusable development window instead of the XENEON EDGE deck.
 * @property {string | null} preview Render the deck offscreen to this PNG file and quit.
 * @property {string} [previewFrames] Capture the demo views into a directory of PNG frames.
 * @property {string} [previewToolbar] Verify the Deck Keys toolbar and capture its icon buttons to this PNG.
 * @property {'tools' | 'break'} [previewToolView] Open Tools or start a full-screen break in a preview.
 * @property {boolean} states Preview the renderer's demo states.
 * @property {boolean} portrait Preview a portrait panel.
 * @property {boolean} stats Preview the Stats view.
 * @property {string | null} display Preferred deck display id.
 * @property {boolean} editor Open the profile editor at startup.
 * @property {boolean} [settings] Open the desktop Settings window at startup.
 * @property {string | null} profile Use this profile file instead of the activity profiles.
 * @property {string} [previewPack] Preview the generated page of this shortcut pack.
 * @property {boolean} [verifyStats] Check the Stats preview layout.
 * @property {boolean} [verifySwipe] Check that a swipe on a wide key changes pages.
 * @property {boolean} [verifyFaders] Check horizontal and vertical audio faders.
 * @property {boolean} [verifyHomeNotification] Check the Home notification and clock geometry.
 * @property {boolean} [previewLargeKeys] Render with the large Deck Keys layout.
 * @property {boolean} [measureDeck] Enable the panel measurement recorder.
 * @property {boolean} [enableWaylandKeyboard] Ask the desktop portal for keyboard permission.
 */

/**
 * Reads Lastra's command-line switches. Unknown arguments (Electron's own, the app path) are ignored.
 *
 * @param {readonly string[]} argv
 * @param {{ cwd?: string }} [options] Base folder for a relative `--profile=` path.
 * @returns {LaunchOptions}
 */
function parseArgs(argv, { cwd } = {}) {
  /** @type {LaunchOptions} */
  const opts = { windowed: false, preview: null, states: false, portrait: false, stats: false, display: null, editor: false, profile: null };
  for (const arg of argv) {
    if (arg === '--windowed') opts.windowed = true;
    else if (arg === '--preview') opts.preview = 'preview.png';
    else if (arg.startsWith('--preview=')) opts.preview = arg.slice('--preview='.length);
    else if (arg.startsWith('--preview-frames=')) {
      opts.previewFrames = arg.slice('--preview-frames='.length);
      if (opts.previewFrames) opts.preview = path.join(opts.previewFrames, 'frame-000.png');
    }
    else if (arg === '--preview-states') opts.states = true;
    else if (arg.startsWith('--preview-toolbar=')) opts.previewToolbar = arg.slice('--preview-toolbar='.length);
    else if (arg === '--preview-tools') opts.previewToolView = 'tools';
    else if (arg === '--preview-break') opts.previewToolView = 'break';
    else if (arg === '--preview-portrait') opts.portrait = true;
    else if (arg === '--preview-stats') opts.stats = true;
    else if (arg === '--preview-large-keys') opts.previewLargeKeys = true;
    else if (arg.startsWith('--preview-pack=')) opts.previewPack = arg.slice('--preview-pack='.length);
    else if (arg === '--verify-stats-layout') opts.stats = opts.verifyStats = true;
    else if (arg === '--verify-deck-swipe') opts.verifySwipe = true;
    else if (arg === '--verify-audio-faders') opts.verifyFaders = true;
    else if (arg === '--verify-home-notification') opts.verifyHomeNotification = true;
    else if (arg === '--measure-deck') opts.measureDeck = true;
    else if (arg === '--enable-wayland-keyboard') opts.enableWaylandKeyboard = true;
    else if (arg === '--editor') opts.editor = true;
    else if (arg === '--settings') opts.settings = true;
    else if (arg.startsWith('--profile=')) {
      const file = arg.slice('--profile='.length);
      opts.profile = cwd === undefined ? path.resolve(file) : path.resolve(cwd, file);
    } else if (arg.startsWith('--display=')) opts.display = arg.slice('--display='.length);
  }
  return opts;
}

module.exports = { parseArgs };
