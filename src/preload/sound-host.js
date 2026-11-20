'use strict';

// The sound player receives play and stop commands and reports back. It has no other access.

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('lastraSoundHost', {
  onCommand: (callback) => { ipcRenderer.on('sound:command', (_event, command) => callback(command)); },
  report: (event) => ipcRenderer.send('sound:event', event),
});
