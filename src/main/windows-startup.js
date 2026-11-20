// @ts-check
'use strict';

function createWindowsStartup(app, { appId, executable, root }) {
  const options = { path: executable, args: app.isPackaged ? [] : [`"${root}"`] };

  function isEnabled() {
    const { openAtLogin, launchItems } = app.getLoginItemSettings(options);
    return openAtLogin && launchItems.some((item) => item.name === appId && item.scope === 'user' && item.enabled);
  }

  function setEnabled(enabled) {
    app.setLoginItemSettings({ ...options, name: appId, openAtLogin: enabled, enabled });
    if (isEnabled() !== enabled) throw new Error('Windows did not apply the startup change');
  }

  return { isEnabled, setEnabled };
}

module.exports = { createWindowsStartup };
