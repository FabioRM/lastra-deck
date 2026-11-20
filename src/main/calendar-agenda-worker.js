// @ts-check
'use strict';

const { parentPort, workerData } = require('node:worker_threads');
const { parseAgenda } = require('./calendar-agenda');

try { parentPort.postMessage({ value: parseAgenda(workerData.input, workerData.now) }); }
catch { parentPort.postMessage({ invalid: true }); }
