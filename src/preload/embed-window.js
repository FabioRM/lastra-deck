'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('lastraEmbed', {
  onState: (callback) => { ipcRenderer.on('embed-window:state', (_event, state) => callback(state)); },
  close: () => ipcRenderer.send('embed-window:command', 'close'),
  openExternal: () => ipcRenderer.send('embed-window:command', 'external'),
});
