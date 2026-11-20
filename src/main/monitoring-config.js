// @ts-check
'use strict';

const fs = require('node:fs');
const path = require('node:path');

function readMonitorConfig(file, label, normalize) {
  let data;
  try {
    const stat = fs.statSync(file);
    if (!stat.isFile() || stat.size > 64 * 1024) throw new Error(`Choose a ${label} file up to 64 KB`);
    data = fs.readFileSync(file, 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    if (err.code) throw new Error(`Could not read the ${label} configuration`);
    throw err;
  }
  let config;
  try {
    config = JSON.parse(data.replace(/^\uFEFF/, ''));
  } catch {
    throw new Error(`The ${label} file contains invalid JSON`);
  }
  return normalize(config);
}

function watchMonitorConfig(file, update, onError) {
  const directory = path.dirname(file);
  const platformName = (name) => process.platform === 'win32' ? name.toLowerCase() : name;
  const name = platformName(path.basename(file));
  let timer;
  let watcher;
  function close() {
    clearTimeout(timer);
    watcher?.close();
  }
  function error() {
    close();
    onError();
  }
  try {
    fs.mkdirSync(directory, { recursive: true });
    watcher = fs.watch(directory, { persistent: false }, (_event, changed) => {
      if (changed && platformName(changed) !== name) return;
      clearTimeout(timer);
      timer = setTimeout(update, 150).unref();
    });
    watcher.on('error', error);
  } catch {
    error();
  }
  return close;
}

function openMonitorConfig(file, label, entryKey, openFile) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  try {
    fs.writeFileSync(file, JSON.stringify({ version: 1, [entryKey]: [] }, null, 2) + '\n', { flag: 'wx' });
  } catch (err) {
    if (err.code !== 'EEXIST') throw new Error(`Could not create the ${label} configuration`);
  }
  return openFile(file);
}

module.exports = { readMonitorConfig, watchMonitorConfig, openMonitorConfig };
