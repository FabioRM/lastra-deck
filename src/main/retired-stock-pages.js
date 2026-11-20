// @ts-check
'use strict';

const { createHash } = require('node:crypto');

// The original 8×3 Home before removing the four duplicate launch and mute controls.
const STOCK_HOME = '66914e027550fabdbcc0a67977253c48433a8efea146488c69f2b0716e3e1566';
const RETIRED_HOME_KEYS = new Set(['vscode', 'claude', 'windows-microphone', 'mute-speakers']);
const RETIRED_APP_MIC_KEYS = new Map([['mic-teams', 'ctrl+shift+m'], ['mic-meet', 'ctrl+d']]);

// Default pages from the original and English releases, before and after an editor save.
const STOCK = {
  vscode: new Set([
    '6613774067e53714151492f492b0310479afd6e4e66becb29902b9005bf43116',
    'd791b9c7fa059e8a6743ae1e359b0c47bb484eba3aa58d6a7820f0c87e945119',
    '505f2ad2cbb9081ae4fbd95fc2fddd602c3579e35632a3639a5a87a735eccbf4',
    'ade79bff5f0042ae72b6769f2706c435c6f28f06a9259486492b9450cde6e3ed',
  ]),
  browser: new Set([
    '5c8a447632c328d371c9e0c0999ebf1a16a0b468dad959046731b423ab8e36af',
    '16ef592a742b1f2fa44650bcbad9409a1ae4ee3a493b88f180748ad496d4dfa8',
    'afb9dc04d52e7e45442f69191a2b0698b03b03724921686f5edb2490ff8b5094',
    '772a94a0e565860ee329795556867c1a1129e613e9f7d00671ad2d465918f416',
  ]),
};

function isRetiredStockPageId(id) {
  return typeof id === 'string' && Object.hasOwn(STOCK, id);
}

function fingerprint(page) {
  const canonical = JSON.stringify(page, (_, value) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, value[key]]));
  });
  return createHash('sha256').update(canonical).digest('hex');
}

function retireStockPages(text) {
  const profile = JSON.parse(text.replace(/^\uFEFF/, ''));
  if (!Array.isArray(profile.pages)) return null;
  const pages = profile.pages.filter((page) => !isRetiredStockPageId(page?.id) || !STOCK[page.id].has(fingerprint(page)));
  if (pages.length === profile.pages.length) return null;
  if (!pages.length) pages.push({ id: 'home', name: 'Home', keys: [] });
  return JSON.stringify({ ...profile, pages }, null, 2) + '\n';
}

function compactStockHome(text) {
  const profile = JSON.parse(text.replace(/^\uFEFF/, ''));
  const home = profile?.pages?.[0];
  if (home?.id !== 'home' || profile.grid?.cols !== 8 || profile.grid?.rows !== 3 || fingerprint(home) !== STOCK_HOME) return null;
  const keys = home.keys.filter((key) => key && !RETIRED_HOME_KEYS.has(key.id));
  profile.pages[0] = { ...home, keys: Array.from({ length: home.keys.length }, (_, index) => keys[index] ?? null) };
  return JSON.stringify(profile, null, 2) + '\n';
}

function retireHomeAppMicrophones(text) {
  const profile = JSON.parse(text.replace(/^\uFEFF/, ''));
  const home = profile?.pages?.find((page) => page.id === 'home');
  if (!Array.isArray(home?.keys)) return null;
  const retired = (key) => key?.action?.type === 'hotkey'
    && RETIRED_APP_MIC_KEYS.has(key.id)
    && RETIRED_APP_MIC_KEYS.get(key.id) === key.action.keys?.toLowerCase();
  if (!home.keys.some(retired)) return null;
  home.keys = home.keys.map((key) => retired(key) ? null : key);
  return JSON.stringify(profile, null, 2) + '\n';
}

module.exports = { isRetiredStockPageId, retireStockPages, compactStockHome, retireHomeAppMicrophones };
