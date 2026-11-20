'use strict';

window.LastraQuickTools = {
  mount({ api, beforeOpen, actions }) {
    const { t } = window.LastraI18n;
    const opener = document.getElementById('quick-tools-open');
    const dialog = document.getElementById('quick-tools');
    const buttons = Array.from(dialog.querySelectorAll('[data-quick-tool]'));
    if (!api) return { open: false, close() {}, render() {} };
    for (const button of dialog.querySelectorAll('[data-tool-dismiss]')) button.addEventListener('click', close);

    const { element, action, decisionCard } = window.LastraWidgetComponents;
    const { DEFAULT_CHOICES, normalizeChoices } = window.LastraDecisions;
    const decisions = document.getElementById('tools-decision-card');
    const timer = window.LastraWidgets.timersCard({ presets: [1, 5, 15, 30] });
    document.getElementById('tools-timers').append(timer.root);
    const soundState = document.getElementById('tools-sound-state');
    const soundClips = document.getElementById('tools-sound-clips');
    const soundStop = document.getElementById('tools-sound-stop');
    let pomodoro;
    let stopSounds;
    let choices;
    let clipSignature;
    let profileRevision;
    let readOnly = false;
    let soundCount = 0;
    let soundPending = false;
    let soundMessage = '';
    let soundReady = false;

    function setChoices(value) {
      const next = normalizeChoices(value);
      if (!next || JSON.stringify(next) === JSON.stringify(choices)) return;
      choices = next;
      decisions.replaceChildren(decisionCard(choices));
    }
    setChoices(DEFAULT_CHOICES);
    const stopChoices = api.onToolChoices?.(setChoices);

    function renderSound() {
      soundState.textContent = soundMessage ? t(soundMessage) : soundReady
        ? soundCount ? t('{number} playing', { number: soundCount }) : t('Nothing playing')
        : t('Reading soundboard…');
      soundStop.disabled = readOnly || soundPending || !soundCount;
      for (const button of soundClips.querySelectorAll('button')) button.disabled = readOnly || soundPending;
    }

    async function changeSound(request) {
      if (!dialog.open || readOnly || soundPending) return;
      soundPending = true;
      soundMessage = '';
      renderSound();
      try {
        const result = await request();
        soundMessage = result?.message || (result?.ok ? '' : 'Soundboard action unavailable.');
      } catch {
        soundMessage = 'Soundboard action unavailable.';
      } finally {
        soundPending = false;
        renderSound();
      }
    }

    function renderClips(clips) {
      const signature = JSON.stringify([window.LastraI18n.language, clips.map(({ id, label }) => [id, label])]);
      if (signature === clipSignature) return;
      clipSignature = signature;
      soundClips.replaceChildren(...clips.map(({ id, label }) =>
        action(t('Play {name}', { name: label }), () => void changeSound(() => api.press(id, 'tap', profileRevision)), label)));
      if (!clips.length) soundClips.append(element('p', 'tools-hint', t('Add a Play sound key to this page or the bar to play it here.')));
      renderSound();
    }

    function setVisible(visible) {
      if (visible && !pomodoro && api.changeToolsPomodoro) {
        const root = document.getElementById('tools-pomodoro');
        const dashboard = document.getElementById('dashboard-pomodoro');
        root.replaceChildren(...Array.from(dashboard.children, (child) => child.cloneNode(true)));
        for (const control of root.querySelectorAll('[id]')) control.id = 'tools-' + control.id;
        pomodoro = window.LastraPomodoro.mount(root, {
          readDashboardPomodoro: api.readDashboardPomodoro, changeDashboardPomodoro: api.changeToolsPomodoro,
        }, 'tools-pomodoro');
      }
      pomodoro?.setReadOnly(readOnly);
      pomodoro?.setVisible(visible);
      timer.setVisible(visible);
      stopSounds?.();
      stopSounds = undefined;
      if (visible) {
        soundMessage = '';
        stopSounds = window.LastraWidgetProviders.sounds.subscribe((state) => {
          soundReady = state.status !== 'loading';
          soundCount = state.playing.length;
          renderSound();
        });
        void api.getToolChoices?.().then(setChoices).catch(() => {});
      }
    }

    const syncExpanded = () => opener.setAttribute('aria-expanded', String(dialog.open));
    function close() {
      if (dialog.open) dialog.close();
      syncExpanded();
    }

    opener.addEventListener('click', () => {
      if (opener.hidden || dialog.open || document.hidden || document.querySelector('dialog[open]')) return;
      beforeOpen();
      dialog.showModal();
      syncExpanded();
      setVisible(true);
    });
    dialog.addEventListener('close', () => {
      if (dialog.open) return;
      setVisible(false);
      syncExpanded();
    });
    document.getElementById('quick-tools-close').addEventListener('click', close);
    document.addEventListener('visibilitychange', () => { if (document.hidden) close(); });
    window.addEventListener('pagehide', () => { close(); setVisible(false); stopChoices?.(); }, { once: true });
    soundStop.addEventListener('click', () => void changeSound(api.stopSounds));

    for (const button of buttons) {
      button.addEventListener('click', () => {
        if (!dialog.open || button.disabled || document.hidden) return;
        close();
        actions[button.dataset.quickTool]();
      });
    }

    return {
      get open() { return dialog.open; }, close,
      render({ visible, unavailable, readOnly: nextReadOnly, revision, clips }) {
        if (!visible) close();
        opener.hidden = !visible;
        profileRevision = revision;
        if (readOnly !== nextReadOnly) {
          readOnly = nextReadOnly;
          timer.setReadOnly(readOnly);
          pomodoro?.setReadOnly(readOnly);
          renderSound();
        }
        renderClips(clips);
        for (const button of buttons) {
          const reason = t(unavailable[button.dataset.quickTool]);
          button.disabled = Boolean(reason);
          const hint = button.querySelector('small');
          if (hint.textContent !== (reason ?? '')) hint.textContent = reason ?? '';
          hint.hidden = !reason;
        }
      },
    };
  },
};
