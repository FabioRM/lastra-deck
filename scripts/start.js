'use strict';

const { spawn } = require('node:child_process');
const { linuxSession } = require('../src/main/desktop-linux');

const args = process.argv.slice(2);
const xwayland = process.platform === 'linux' && process.env.DISPLAY && ['gnome', 'kde'].includes(linuxSession());
// Chromium selects Ozone before loading the Electron main script.
const switches = xwayland ? ['--ozone-platform=x11'] : [];
const appArgs = xwayland ? args.filter((arg) => !arg.startsWith('--ozone-platform=')) : args;
const child = spawn(require('electron'), [...switches, '.', ...appArgs], { stdio: 'inherit' });
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => child.kill(signal));
child.on('error', (error) => { console.error(error.message); process.exitCode = 1; });
child.on('exit', (code, signal) => { process.exitCode = code ?? (signal === 'SIGINT' ? 130 : 1); });
