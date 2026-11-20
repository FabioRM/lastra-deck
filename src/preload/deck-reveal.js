'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('lastraReveal', { restore: () => ipcRenderer.send('desktop-reveal:restore') });
