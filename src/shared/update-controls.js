'use strict';

{
  const api = window.lastraEditor ?? window.lastra;
  const { t } = window.LastraI18n;
  const surfaces = [...document.querySelectorAll('[data-update-controls]')].map((root) => ({
    root,
    settings: root.hasAttribute('data-update-settings'),
    heading: root.querySelector('[data-update-message]'),
    note: root.querySelector('[data-update-note]'),
    version: root.querySelector('[data-update-current]'),
    buttons: [...root.querySelectorAll('button[data-update-action]')],
  }));
  let status;
  let commandFailed = false;
  let pushed = false;

  function updateMessage(state) {
    const values = { version: status.version ?? '', percent: status.percent ?? 0 };
    switch (state) {
      case 'disabled': return t('Updates are off in this build.');
      case 'checking': return t('Checking for updates…');
      case 'available': return t('Version {version} is available.', values);
      case 'downloading': return t('Downloading update {version} ({percent}%)', values);
      case 'downloaded': return t('Version {version} is ready.', values);
      case 'error': return t('The last update check failed.');
      case 'up-to-date': return t('Lastra is up to date.');
      default: return t('Lastra checks GitHub for new releases automatically.');
    }
  }

  function render() {
    if (!status) return;
    const { state, deferred, downloadFailed, currentVersion } = status;
    for (const { root, settings, heading, note, version, buttons } of surfaces) {
      root.hidden = !settings && !(state === 'downloading' || state === 'downloaded' || (state === 'available' && !deferred));
      if (root.hidden) continue;
      const message = updateMessage(state);
      if (heading.textContent !== message) heading.textContent = message;
      if (version) version.textContent = currentVersion ? t('Installed version {version}', { version: currentVersion }) : '';
      const detail = commandFailed ? t('Could not perform the update action.')
        : downloadFailed ? t('The download failed. You can try again.')
          : state === 'available' ? t('After download, the update installs when Lastra closes.')
            : state === 'downloaded' ? t('Restart or close Lastra to install the update.') : '';
      if (note.textContent !== detail) note.textContent = detail;
      note.hidden = !detail;
      for (const button of buttons) {
        const action = button.dataset.updateAction;
        button.hidden = action === 'check' ? !['disabled', 'idle', 'checking', 'up-to-date', 'error'].includes(state)
          : state !== ({ download: 'available', later: 'available', restart: 'downloaded' })[action]
            || (action === 'later' && deferred);
        button.disabled = action === 'check' && (state === 'disabled' || state === 'checking');
        if (action === 'download') button.textContent = t(downloadFailed ? 'Retry download' : 'Download update');
      }
    }
  }

  if (surfaces.length && api?.updateStatus) {
    for (const { buttons } of surfaces) {
      for (const button of buttons) button.addEventListener('click', async () => {
        try {
          commandFailed = await api.updateCommand(button.dataset.updateAction, status?.version) !== true;
        } catch {
          commandFailed = true;
        }
        render();
      });
    }
    api.onUpdateStatus((next) => {
      pushed = true;
      commandFailed = false;
      status = next;
      render();
    });
    void api.updateStatus().then((next) => {
      if (pushed || !next?.state) return;
      status = next;
      render();
    }).catch(() => {});
    document.addEventListener('lastra-language', render);
  }
}
