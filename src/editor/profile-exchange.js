'use strict';

window.createProfileExchange = function createProfileExchange(dialog, api, planImport) {
  const { element } = window.LastraDom;
  const title = dialog.querySelector('h2');
  const details = dialog.querySelector('[data-exchange-details]');
  const status = dialog.querySelector('[data-exchange-status]');
  const confirm = dialog.querySelector('[data-exchange-confirm]');
  const cancel = dialog.querySelector('[data-exchange-cancel]');
  const names = {
    launch: 'Launch program', open: 'Open link or file', workspace: 'Restore workspace', hotkey: 'Keyboard shortcut',
    text: 'Type text', audio: 'Change audio', media: 'Control media', 'spotify-playback': 'Control Spotify',
    'obs-scene': 'Set OBS scene', timer: 'Control a timer', sound: 'Play a sound', sequence: 'Run sequence', delay: 'Wait', 'wait-for': 'Wait for state', if: 'Conditional action',
  };
  const dependencies = {
    applications: 'Foreground applications', programs: 'Programs to launch', links: 'Link hosts and files',
    workspaces: 'Configured workspaces', obsScenes: 'OBS scenes', providers: 'Providers',
  };
  let revision = 0;
  let accept;

  function list(label, items) {
    const group = element('details');
    group.append(element('summary', '', `${label} (${items.length})`));
    const values = element('ul');
    values.append(...items.map((value) => element('li', '', value)));
    group.append(values);
    return group;
  }

  function render({ summary }, collisions, mode) {
    const { kind, name, pages, keys, widgets, linkedControls, macros, actions, removedImages } = summary;
    details.append(element('h3', '', name));
    const count = (number, label) => `${number} ${label}${number === 1 ? '' : 's'}`;
    details.append(element('p', '', [count(pages, 'page'), count(keys, 'key'), count(widgets, 'widget'),
      ...(linkedControls ? [count(linkedControls, 'linked control')] : []), ...(macros ? [count(macros, 'shared macro')] : [])].join(' · ')));
    const actionList = Object.entries(actions).map(([type, number]) => `${names[type] ?? type} × ${number}`);
    if (actionList.length) {
      const actions = list('Actions', actionList);
      actions.open = true;
      details.append(actions);
    }
    for (const [field, label] of Object.entries(dependencies)) {
      const values = summary.dependencies[field];
      if (values.length) details.append(list(label, values));
    }
    if (collisions?.length) details.append(list('Foreground matches already used and omitted', collisions.map(({ value }) => value)));
    if (removedImages) details.append(element('p', '', `${count(removedImages, 'file-linked image')} omitted. Add portable images in the Image library.`));
    if (kind === 'page' && mode === 'export') details.append(element('p', '',
      'Shared controls, macros and variables used on this page are saved as standalone actions and values.'));
    if (mode === 'export') details.append(element('p', '',
      'Review typed text, command arguments and links for private information before sharing. Configure accounts and credentials on the destination.'));
    else {
      details.append(element('p', '', kind === 'profile'
        ? 'This replaces the current draft. Undo restores the draft you were editing. Save profile applies it to Lastra.'
        : 'This adds a copy to the current draft. Save profile applies it to Lastra.'));
      details.append(element('p', '', 'Configure required accounts and credentials on this computer.'));
    }
  }

  async function show(mode, draft, pageId) {
    if (dialog.open) return;
    const request = ++revision;
    accept = undefined;
    const exporting = mode === 'export';
    title.textContent = exporting ? `Export ${pageId ? 'page' : 'profile'}` : window.LastraI18n.t('Import page or profile');
    details.replaceChildren();
    status.textContent = exporting ? window.LastraI18n.t('Preparing export…') : window.LastraI18n.t('Choose a Lastra or Stream Deck file…');
    confirm.disabled = true;
    confirm.hidden = true;
    dialog.showModal();
    try {
      const data = exporting ? await api.prepareExchange(pageId ? 'page' : 'profile', draft, pageId) : await api.openExchange();
      if (request !== revision || !dialog.open) return;
      if (!data) {
        dialog.close();
        return;
      }
      if (!exporting && data.streamDeck) {
        title.textContent = window.LastraI18n.t('Import Stream Deck pages');
        confirm.textContent = window.LastraI18n.t('Add pages to draft');
        confirm.hidden = false;
        const selection = window.LastraStreamDeckImport.renderReview(details, data.streamDeck, draft, (result) => {
          status.textContent = result.error || 'Save profile applies the new pages to Lastra.';
          confirm.disabled = Boolean(result.error);
        });
        accept = () => {
          const result = selection();
          if (result.error) throw new Error(result.error);
          const plan = planImport(result.bundle, draft);
          if (!plan.apply()) throw new Error('The editor changed. Reopen import and review the file again.');
          dialog.close();
        };
        return;
      }
      const plan = exporting ? null : planImport(data.bundle, draft);
      render(data, plan?.collisions, mode);
      status.textContent = '';
      confirm.textContent = exporting ? window.LastraI18n.t('Choose destination…') : data.bundle.kind === 'page' ? window.LastraI18n.t('Add page to draft') : window.LastraI18n.t('Replace draft');
      confirm.hidden = false;
      confirm.disabled = false;
      accept = async () => {
        confirm.disabled = true;
        if (exporting) {
          status.textContent = window.LastraI18n.t('Choose where to save the exchange file…');
          const saved = await api.saveExchange(data.bundle);
          if (request !== revision || !dialog.open) return;
          status.textContent = saved ? window.LastraI18n.t('Exchange file saved.') : '';
          if (saved) confirm.hidden = true;
          else confirm.disabled = false;
        } else {
          if (!plan.apply()) throw new Error('The editor changed. Reopen import and review the file again.');
          dialog.close();
        }
      };
    } catch (error) {
      if (request === revision && dialog.open) status.textContent = error.message;
    }
  }

  cancel.addEventListener('click', () => dialog.close());
  confirm.addEventListener('click', async () => {
    const request = revision;
    try {
      await accept?.();
    } catch (error) {
      if (request === revision && dialog.open) {
        status.textContent = error.message;
        confirm.disabled = false;
      }
    }
  });
  dialog.addEventListener('close', () => { if (!dialog.open) accept = undefined; });

  return { open: (draft) => show('import', draft), export: (draft, pageId) => show('export', draft, pageId) };
};
