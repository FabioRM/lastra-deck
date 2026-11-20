// @ts-check
'use strict';

const path = require('node:path');
const { translate } = require('../shared/i18n');
const HTML = path.join(__dirname, '..', 'agent-review', 'index.html');
const PRELOAD = path.join(__dirname, '..', 'preload', 'agent-review.js');

function createAgentReview({ BrowserWindow, ipcMain, bounds, language = () => 'en' }) {
  let open = false;
  const approve = ({ signal, ...proposal }) => new Promise((resolve) => {
    if (signal.aborted || open) return resolve(false);
    const action = proposal.kind === 'action';
    const choice = proposal.kind === 'choice';
    const locale = language();
    const title = translate(locale, choice ? 'Agent decision request' : action ? 'Lastra action approval' : 'Lastra profile approval');
    const window = new BrowserWindow({
      ...bounds(), show: false, title, autoHideMenuBar: true,
      ...(action || choice ? { focusable: false, alwaysOnTop: true, skipTaskbar: true } : {}),
      webPreferences: { preload: PRELOAD, sandbox: true, contextIsolation: true, nodeIntegration: false },
    });
    open = true;
    let finished = false;
    const fromReview = (event) => event.sender === window.webContents && event.senderFrame === window.webContents.mainFrame;
    const answer = (event, decision) => {
      if (!fromReview(event)) return;
      if (choice) {
        if (decision === false) finish(false);
        else if (proposal.choices.some(({ id }) => id === decision?.choice)) finish({ choice: decision.choice });
        return;
      }
      finish(decision === 'editor' && proposal.allowEditor ? 'editor' : decision === true && !proposal.editorOnly);
    };
    const state = (event) => {
      if (!fromReview(event)) throw new Error('Agent review is unavailable.');
      return proposal;
    };
    const abort = () => finish(false);
    function finish(accepted) {
      if (finished) return;
      finished = true;
      open = false;
      ipcMain.removeHandler('agent-review:state');
      ipcMain.removeListener('agent-review:answer', answer);
      signal.removeEventListener('abort', abort);
      if (!window.isDestroyed()) window.destroy();
      resolve(accepted);
    }
    ipcMain.handle('agent-review:state', state);
    ipcMain.on('agent-review:answer', answer);
    signal.addEventListener('abort', abort, { once: true });
    window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    window.webContents.on('will-navigate', (event) => event.preventDefault());
    window.on('page-title-updated', (event) => event.preventDefault());
    window.once('closed', abort);
    window.once('ready-to-show', () => action || choice ? window.showInactive() : window.show());
    void window.loadFile(HTML, { query: { language: locale } }).catch(abort);
  });
  return Object.assign(approve, { isOpen: () => open });
}

module.exports = { createAgentReview };
