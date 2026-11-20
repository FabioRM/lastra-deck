'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('lastraReview', {
  state: () => ipcRenderer.invoke('agent-review:state'),
  answer: (approved) => ipcRenderer.send('agent-review:answer', approved),
});
