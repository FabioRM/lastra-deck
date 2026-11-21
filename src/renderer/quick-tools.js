'use strict';

window.LastraQuickTools = {
  mount({ api, beforeOpen, actions }) {
    const { t } = window.LastraI18n;
    const opener = document.getElementById('quick-tools-open');
    const panel = document.getElementById('quick-tools');
    const closer = document.getElementById('quick-tools-close');
    if (!api) return { open: false, close() {}, render() {} };
    const optionsDialog = document.getElementById('tools-options-dialog');
    const optionsTitle = document.getElementById('tools-options-title');
    const optionsStatus = document.getElementById('tools-options-status');
    const buttons = Array.from(panel.querySelectorAll('[data-quick-tool]'));
    for (const button of panel.querySelectorAll('[data-tool-dismiss]')) button.addEventListener('click', close);

    const { element, action, decisionCard } = window.LastraWidgetComponents;
    const { DEFAULT_CHOICES, normalizeChoices } = window.LastraDecisions;
    const decisions = document.getElementById('tools-decision-card');
    const timer = window.LastraWidgets.timersCard({ presets: [1, 5, 15, 30] });
    document.getElementById('tools-timers').append(timer.root);
    const soundState = document.getElementById('tools-sound-state');
    const soundClips = document.getElementById('tools-sound-clips');
    const soundStop = document.getElementById('tools-sound-stop');
    const runningMacros = document.getElementById('quick-tools-running-flows');
    const options = [...panel.querySelectorAll('.tools-options-toggle')];
    let activeOptions;
    let pomodoro;
    let stopSounds;
    let choices;
    let clipSignature;
    let flowSignature;
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

    function closeOptions() {
      if (!activeOptions) return;
      const { button, form } = activeOptions;
      activeOptions = undefined;
      if (optionsDialog.open) optionsDialog.close();
      form.hidden = true;
      if (!panel.hidden && !document.hidden) button.focus({ preventScroll: true });
    }

    document.getElementById('tools-options-close').addEventListener('click', closeOptions);
    optionsDialog.addEventListener('cancel', (event) => { event.preventDefault(); closeOptions(); });
    optionsDialog.addEventListener('close', () => { if (!optionsDialog.open) closeOptions(); });
    document.addEventListener('lastra-language', () => {
      if (activeOptions) optionsTitle.textContent = activeOptions.button.title;
    });

    function bindOptions(tool, load, submit) {
      const form = document.getElementById(`tools-${tool}-options`);
      const button = options.find((item) => item.dataset.toolOptions === tool);
      button.addEventListener('click', () => {
        if (panel.hidden || readOnly || optionsDialog.open || document.querySelector('dialog[open]')) return;
        load?.(form);
        optionsTitle.textContent = button.title;
        optionsStatus.textContent = '';
        form.hidden = false;
        activeOptions = { button, form };
        optionsDialog.showModal();
      });
      form.addEventListener('submit', async (event) => {
        event.preventDefault();
        const request = activeOptions;
        if (!optionsDialog.open || request?.form !== form || readOnly || form.inert) return;
        optionsStatus.textContent = '';
        form.inert = true;
        try {
          const result = await submit(form);
          if (activeOptions !== request || !optionsDialog.open) return;
          if (result.ok) closeOptions();
          else optionsStatus.textContent = t(result.message);
        } catch (error) {
          if (activeOptions === request && optionsDialog.open) optionsStatus.textContent = t(error.message);
        } finally { form.inert = false; }
      });
      return button;
    }

    bindOptions('timer', null, ({ elements }) => {
      const minutes = elements.minutes.valueAsNumber;
      return timer.startCountdown(elements.label.value.trim() || `${minutes} min`, minutes * 60_000);
    });
    const pomodoroOptions = bindOptions('pomodoro', ({ elements }) => {
      elements.focus.value = pomodoro.durations.focus / 60_000;
      elements.break.value = pomodoro.durations.break / 60_000;
    }, ({ elements }) => pomodoro.configure({ focus: elements.focus.valueAsNumber * 60_000, break: elements.break.valueAsNumber * 60_000 }));
    bindOptions('decision', ({ elements }) => { elements.choices.value = choices.join('\n'); }, async ({ elements }) => {
      const lines = elements.choices.value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
      try {
        const result = await api.setToolChoices(lines);
        if (result.ok) setChoices(result.choices);
        return result;
      } catch { return { ok: false, message: 'Could not save the pick list.' }; }
    });

    function renderSound() {
      soundState.textContent = soundMessage ? t(soundMessage) : soundReady
        ? soundCount ? t('{number} playing', { number: soundCount }) : t('Nothing playing')
        : t('Reading soundboard…');
      soundStop.disabled = readOnly || soundPending || !soundCount;
      for (const button of soundClips.querySelectorAll('button')) button.disabled = readOnly || soundPending;
    }

    async function changeSound(request) {
      if (panel.hidden || readOnly || soundPending) return;
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

    function renderRunningFlows(flows) {
      const signature = JSON.stringify([window.LastraI18n.language, flows]);
      if (signature === flowSignature) return;
      flowSignature = signature;
      runningMacros.replaceChildren(...flows.map(({ id, label }) => action(`${label} · ${t('Running')}`, () => {
        close();
        actions.runningFlow(id);
      })));
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
        pomodoroOptions.hidden = false;
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

    function close() {
      if (panel.hidden) return;
      panel.hidden = true;
      opener.setAttribute('aria-expanded', 'false');
      closeOptions();
      setVisible(false);
      if (!opener.hidden && !document.hidden) opener.focus({ preventScroll: true });
    }

    opener.addEventListener('click', () => {
      if (opener.hidden || !panel.hidden || document.hidden || document.querySelector('dialog[open]')) return;
      beforeOpen();
      panel.hidden = false;
      opener.setAttribute('aria-expanded', 'true');
      setVisible(true);
      closer.focus({ preventScroll: true });
    });
    closer.addEventListener('click', close);
    document.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape' || panel.hidden || document.querySelector('dialog[open]')) return;
      event.preventDefault();
      close();
    });
    document.addEventListener('lastra:session-blocked', ({ detail }) => { if (detail) close(); });
    document.addEventListener('visibilitychange', () => { if (document.hidden) close(); });
    window.addEventListener('pagehide', () => { close(); stopChoices?.(); }, { once: true });
    soundStop.addEventListener('click', () => void changeSound(api.stopSounds));

    for (const button of buttons) {
      button.addEventListener('click', () => {
        if (panel.hidden || button.disabled || document.hidden) return;
        close();
        actions[button.dataset.quickTool]();
      });
    }

    return {
      get open() { return !panel.hidden; }, close,
      render({ visible, unavailable, readOnly: nextReadOnly, revision, clips, runningFlows }) {
        if (!visible) close();
        opener.hidden = !visible;
        profileRevision = revision;
        if (readOnly !== nextReadOnly) {
          readOnly = nextReadOnly;
          timer.setReadOnly(readOnly);
          pomodoro?.setReadOnly(readOnly);
          for (const button of options) button.disabled = readOnly;
          renderSound();
        }
        renderClips(clips);
        renderRunningFlows(runningFlows);
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
