'use strict';

const { contextBridge, ipcRenderer } = require('electron');

if (process.isMainFrame) contextBridge.exposeInMainWorld('lastraPanelPreview', {
  onUpdate: (callback) => ipcRenderer.on('panel-preview:update', (_event, data) => callback(data)),
  close: () => ipcRenderer.send('panel-preview:close'),
});
