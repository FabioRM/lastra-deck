'use strict';

// The deck renders keys and asks the main process to run their actions.

(() => {
  const STAGE_W = 2560;
  const STAGE_H = 720;
  const DEFAULT_GESTURES = { holdMs: 550, confirmMs: 650, doubleTapMs: 320, cancelDistance: 18 };
  const STATUS_MS = 4000;
  const SWIPE_PAGE_DISTANCE = 72;
  const WHEEL_PAGE_DISTANCE = 36;
  const WHEEL_GESTURE_GAP = 180;
  const REVEAL_EDGE = 22;
  const REVEAL_DISTANCE = 100;
  const PROMPT_ARM_MS = 350;
  const VIEWS = {
    'dashboard-panel': 'dashboard', 'stats-panel': 'stats', 'feeds-panel': 'feeds', 'obs-panel': 'obs',
    'app-views-panel': 'apps', 'emoji-panel': 'emoji',
  };
  const VIEW_BUTTONS = { obs: 'obs-tab', apps: 'app-views-tab', emoji: 'emoji-tab' };
  const VIEW_LABELS = { keys: 'Deck keys', dashboard: 'Dashboard', stats: 'Stats', feeds: 'Feeds' };

  const api = window.lastra;
  const { t, set: setLanguage } = window.LastraI18n;
  const measurement = window.LastraPanelMeasurement;
  const { FIXED_EDITING_KEYS, projectEditingPage, projectShortcutPages } = window.LastraEditingKeys;
  const { projectPage } = window.LastraWidgetLayout;
  const { obsSceneState } = window.LastraLinkedControls;
  const { flowFeedback } = window.LastraFlowFeedback;
  const viewSource = api ?? window.LastraDeckPreview;
  const stage = document.getElementById('stage');
  const keysEl = document.getElementById('keys');
  const widgetBar = document.getElementById('widget-bar');
  const deck = document.getElementById('deck');
  const pageNav = document.getElementById('page-nav');
  const sidePanel = document.getElementById('panel');
  const dashboard = document.getElementById('dashboard-panel');
  const stats = document.getElementById('stats-panel');
  const feedsPanel = document.getElementById('feeds-panel');
  let viewCycle = ['keys', 'dashboard', 'stats', 'feeds'];
  const viewSwitch = document.getElementById('dashboard-switch');
  const statusEl = document.getElementById('status');
  const homeNotification = document.getElementById('home-notification');
  const keyErrorStatus = document.getElementById('key-error-status');
  const confirmationDialog = document.getElementById('key-confirmation');
  const confirmationText = document.getElementById('key-confirmation-text');
  const confirmationCancel = document.getElementById('key-confirmation-cancel');
  const confirmationRun = document.getElementById('key-confirmation-run');
  const feedbackDialog = document.getElementById('key-feedback-dialog');
  const feedbackTitle = document.getElementById('key-feedback-title');
  const feedbackState = document.getElementById('key-feedback-state');
  const feedbackMessage = document.getElementById('key-feedback-message');
  const feedbackSteps = document.getElementById('key-feedback-steps');
  const feedbackStopFlow = document.getElementById('key-feedback-stop-flow');
  const feedbackLabels = { pending: 'Running', success: 'Succeeded', error: 'Failed', unavailable: 'Unavailable', cancelled: 'Stopped' };
  const keyFeedback = new Map();
  const liveKeyParts = new WeakMap();
  // Per key button: { slot, revision, unavailable, targetBound, badge }.
  const mountedKeys = new WeakMap();
  const GESTURE_CANCEL = 'lastra:gesture-cancel';
  const demo = new URLSearchParams(location.search).get('demo') === 'states';

  let profile = null;
  let statusTimer = null;
  let audio = null;
  let obsState;
  let linkedPending = {};
  let staleAudioTimer;
  let spotifyState;
  let stopSpotifyFeedback;
  let sensorState;
  let stopSensorFeedback;
  let timerState;
  let stopTimerFeedback;
  let soundState;
  let stopSoundFeedback;
  let swipe = null;
  let stageScale = 1;
  let gridLayout;
  let signedProfile;
  let profileSignature;
  let gridPortrait;
  let largeKeys = false;
  let quickLayout;
  let quickSheet = 0;
  let renderedSheet;
  let changingSheet = false;
  let pageWidgets;
  let barWidgets;
  let barSignature = '';
  let barKeySignature;
  let pendingConfirmation = null;
  let inspectedFeedback = null;
  let activeView = null;
  let stopTelemetry;
  let savedView;
  let pendingViewSave = false;
  let pendingNavigation;

  const quickTools = window.LastraQuickTools.mount({
    api,
    beforeOpen() {
      swipe = null;
      for (const key of stage.querySelectorAll('.key')) key.dispatchEvent(new Event('lastra:swipe-cancel'));
      showPageMatch(false);
      window.LastraDashboardAudio?.closeOutputPicker();
    },
    actions: {
      runningFlow: (id) => inspectKeyFeedback(keyFeedback.get(id)),
      backlight: () => window.LastraDisplayBacklight?.open(),
      output() {
        if (!profile?.viewOnly && !window.LastraDashboardAudio?.openOutputPicker()) {
          showStatus(window.LastraI18n.t('Audio output selection is unavailable.'), false);
        }
      },
      desktop() {
        if (!profile?.desktopRevealGesture) return;
        void api.revealDesktop().then((shown) => {
          if (!shown) showStatus(window.LastraI18n.t('Desktop reveal is unavailable.'), false);
        }).catch((error) => showStatus(error.message, false));
      },
    },
  });

  function renderQuickTools() {
    quickTools.render({
      visible: Boolean(api && profile && !activeView),
      readOnly: profile?.viewOnly === true,
      revision: profile?.revision,
      runningFlows: [...keyFeedback].filter(([, entry]) => entry.pending && entry.progress && !entry.unavailable)
        .map(([id, { label }]) => ({ id, label })),
      clips: profile ? [...profile.slots, ...(profile.bar?.keys ?? [])]
        .filter((key) => key?.sound && !key.confirm && !key.unavailable
          && (key.id.startsWith('bar:') || !profile.targetUnavailable)) : [],
      unavailable: {
        backlight: api?.readDisplayBacklight ? null : 'Display backlight is unavailable.',
        output: profile?.viewOnly ? 'View-only mode is on.' : api?.getAudioOutputs ? null : 'Audio output selection is unavailable.',
        desktop: profile?.desktopRevealGesture ? null : 'Enable Desktop reveal in the Lastra tray.',
      },
    });
  }

  function closeActiveView() {
    activeView?.dispatchEvent(new Event('lastra:close-view'));
  }

  function nextPrimaryView() {
    const current = VIEWS[activeView?.id] ?? 'keys';
    const index = Math.max(0, viewCycle.indexOf(current));
    return viewCycle[(index + 1) % viewCycle.length];
  }

  function updateViewSwitch() {
    const next = nextPrimaryView();
    viewSwitch.dataset.next = next;
    viewSwitch.title = t('Show ' + VIEW_LABELS[next]);
    viewSwitch.setAttribute('aria-label', viewSwitch.title);
  }

  function showPrimaryView(view) {
    if (view === 'dashboard') window.LastraDashboard?.setOpen(true);
    else if (view === 'stats') window.LastraStats?.setOpen(true);
    else if (view === 'feeds') window.LastraFeeds?.setOpen(true);
    else closeActiveView();
  }

  function applyDeckNavigation(next) {
    if (!profile) {
      pendingNavigation = next;
      return;
    }
    if (Array.isArray(next.views) && next.views.length) viewCycle = next.views;
    savedView = ['dashboard', 'stats', 'feeds'].includes(next.view) && !viewCycle.includes(next.view) ? 'keys' : next.view;
    if (next.statsTab) window.LastraStats?.selectTab(next.statsTab);
    if (Number.isSafeInteger(next.sheet) && quickSheet !== next.sheet) {
      quickTools.close();
      quickSheet = next.sheet;
      fitStage();
    }
    if ((VIEWS[activeView?.id] ?? 'keys') === savedView) return;
    closeActiveView();
    if (Object.hasOwn(VIEW_LABELS, savedView)) showPrimaryView(savedView);
    else document.getElementById(VIEW_BUTTONS[savedView])?.click();
  }

  function rememberView() {
    if (!api || !savedView || pendingViewSave) return;
    pendingViewSave = true;
    queueMicrotask(() => {
      pendingViewSave = false;
      const current = VIEWS[activeView?.id] ?? 'keys';
      if (current === savedView) return;
      savedView = current;
      void api.setDeckView(current).catch((err) => showStatus(err.message, false));
    });
  }

  window.LastraDeckViews = {
    get active() { return activeView; },
    setPanel(panel, open, { remember = true } = {}) {
      closeKeyFeedback();
      if (open) {
        closePageDirectory();
        quickTools.close();
      }
      if (open && activeView !== panel) closeActiveView();
      if (open) showPageMatch(false);
      const fullPanel = (item) => item === dashboard || item === stats || item === feedsPanel;
      const wasFullPanel = fullPanel(activeView);
      panel.hidden = !open;
      if (open) activeView = panel;
      else if (activeView === panel) activeView = null;
      const isFullPanel = fullPanel(activeView);
      if (isFullPanel) stage.dataset.cornerClock = 'on';
      else delete stage.dataset.cornerClock;
      if (isFullPanel && !wasFullPanel) sidePanel.dispatchEvent(new Event('lastra:close-view'));
      deck.hidden = sidePanel.hidden = isFullPanel;
      keysEl.hidden = Boolean(activeView);
      updateViewSwitch();
      renderQuickTools();
      updateWidgetVisibility();
      if (wasFullPanel !== isFullPanel) {
        updateTelemetryVisibility();
        if (!isFullPanel) fitStage();
      }
      updateClock();
      if (remember) rememberView();
    },
  };

  function updateWidgetVisibility() {
    if (keysEl.hidden) closeConfirmation();
    pageWidgets?.setVisible(!keysEl.hidden);
    barWidgets?.setVisible(!widgetBar.hidden);
    updateLiveKeyVisibility();
  }

  function renderLiveKeys() {
    const { keyLiveState, keyLiveAppearance, keyReading, timerKeyState, soundKeyState } = window.LastraKeyLiveState;
    const { lastReading } = window.LastraReadingTime;
    const now = Date.now();
    for (const key of stage.querySelectorAll('.key:is([data-live-source], [data-readout])')) {
      const parts = liveKeyParts.get(key);
      const source = key.dataset.liveSource;
      const live = parts.sceneTarget ? obsSceneState(obsState, parts.sceneTarget)
        : source === 'timer' ? timerKeyState(timerState, parts.timer, now)
        : source === 'sound' ? soundKeyState(soundState, parts.sound, now)
        : source ? keyLiveState(source, audio, spotifyState, now) : { text: '', pressed: null };
      const audioUnavailable = parts.controlId && (source === 'output' || source === 'microphone') && live.pressed === null
        ? live.text === 'Cached' ? 'Waiting for a fresh Windows audio reading.' : 'Windows audio is unavailable.' : undefined;
      const unavailable = parts.unavailable ?? live.unavailable ?? audioUnavailable;
      const feedback = keyFeedback.get(key.dataset.id);
      if (feedback && feedback.unavailable !== unavailable) {
        feedback.unavailable = unavailable;
        renderKeyFeedback(feedback);
      }
      if (unavailable || profile?.viewOnly) key.setAttribute('aria-disabled', 'true');
      else key.removeAttribute('aria-disabled');
      const ownReading = source === 'timer' || source === 'sound';
      const reading = ownReading ? (key.dataset.readout && live.reading ? { text: live.reading } : null)
        : key.dataset.readout && keyReading(key.dataset.readout, source, { audio, spotify: spotifyState, sensors: sensorState }, now);
      const { pressed } = live;
      const missing = !source ? 'Unavailable' : !ownReading && key.dataset.readout && live.text !== 'Unavailable' ? '—' : '';
      const text = [t(live.text), reading?.stale && live.text !== 'Cached' && t('Cached'), reading?.text ?? t(missing)]
        .filter(Boolean).join(' · ');
      const appearance = keyLiveAppearance(source, parts.baseLabel, live);
      if (parts.stateLabel.textContent !== text) parts.stateLabel.textContent = text;
      const sampledAt = ownReading ? undefined
        : reading?.sampledAt ?? (source === 'spotify' ? spotifyState?.sampledAt : source && audio?.sampledAt);
      const updated = lastReading(sampledAt);
      parts.title ??= key.title;
      const liveReason = !parts.unavailable && unavailable;
      const title = [parts.title, liveReason, updated].filter(Boolean).join(' · ');
      if (key.title !== title) key.title = title;
      parts.description ??= key.getAttribute('aria-description') ?? '';
      const description = [parts.description, liveReason, updated].filter(Boolean).join('. ');
      if (description && key.getAttribute('aria-description') !== description) key.setAttribute('aria-description', description);
      else if (!description) key.removeAttribute('aria-description');
      if (parts.label.textContent !== appearance.label) parts.label.textContent = appearance.label;
      if (key.dataset.liveTone !== appearance.tone) key.dataset.liveTone = appearance.tone;
      if (parts.icons) {
        const icon = parts.icons[appearance.state] ?? parts.baseIcon ?? '';
        if (parts.icon !== icon) {
          parts.glyph.innerHTML = icon;
          parts.icon = icon;
        }
      }
      if (pressed === null) key.removeAttribute('aria-pressed');
      else if (key.getAttribute('aria-pressed') !== String(pressed)) key.setAttribute('aria-pressed', String(pressed));
    }
  }

  function updateLiveKeyVisibility() {
    const visible = (selector) => !document.hidden && ((!keysEl.hidden && keysEl.querySelector(selector))
      || (!widgetBar.hidden && widgetBar.querySelector(selector)));
    const needsSpotify = visible('.key:is([data-live-source="spotify"], [data-readout="spotify-remaining"])');
    if (needsSpotify && !stopSpotifyFeedback) {
      stopSpotifyFeedback = window.LastraWidgetProviders.spotify.subscribe((state) => {
        spotifyState = state;
        renderLiveKeys();
      });
    } else if (!needsSpotify && stopSpotifyFeedback) {
      stopSpotifyFeedback();
      stopSpotifyFeedback = undefined;
      spotifyState = undefined;
    }
    const needsTimers = visible('.key[data-live-source="timer"]');
    if (needsTimers && !stopTimerFeedback) {
      const stop = window.LastraWidgetProviders.timers.subscribe((state) => {
        timerState = state;
        renderLiveKeys();
      });
      // A running timer changes every second without a new snapshot.
      const tick = setInterval(() => {
        if (timerState?.timers?.some(({ status }) => status === 'running')) renderLiveKeys();
      }, 500);
      stopTimerFeedback = () => {
        stop();
        clearInterval(tick);
      };
    } else if (!needsTimers && stopTimerFeedback) {
      stopTimerFeedback();
      stopTimerFeedback = undefined;
      timerState = undefined;
    }
    const needsSounds = visible('.key[data-live-source="sound"]');
    if (needsSounds && !stopSoundFeedback) {
      const stop = window.LastraWidgetProviders.sounds.subscribe((state) => {
        soundState = state;
        renderLiveKeys();
      });
      const tick = setInterval(() => { if (soundState?.playing?.length) renderLiveKeys(); }, 250);
      stopSoundFeedback = () => {
        stop();
        clearInterval(tick);
      };
    } else if (!needsSounds && stopSoundFeedback) {
      stopSoundFeedback();
      stopSoundFeedback = undefined;
      soundState = undefined;
    }
    const needsTelemetry = visible('.key[data-sensor-readout]');
    if (needsTelemetry && !stopSensorFeedback) {
      stopSensorFeedback = window.LastraWidgetProviders.telemetry.subscribe((sample) => {
        sensorState = sample;
        renderLiveKeys();
      });
    } else if (!needsTelemetry && stopSensorFeedback) {
      stopSensorFeedback();
      stopSensorFeedback = undefined;
      sensorState = undefined;
    }
    renderLiveKeys();
  }

  document.addEventListener('visibilitychange', updateLiveKeyVisibility);

  function renderPageGrid() {
    const layout = quickLayout.sheets[quickSheet];
    const gestures = profile.gestures ?? DEFAULT_GESTURES;
    pageWidgets?.destroy();
    for (const key of keysEl.querySelectorAll('.key')) key.dispatchEvent(new Event(GESTURE_CANCEL));
    const editingKeys = profile.editingKeys ?? FIXED_EDITING_KEYS.map((key) => ({
      id: key.id, label: key.label, category: 'system', unavailable: 'Bring a verified app window to the foreground.',
    }));
    function renderAt(slot, position, editing = false) {
      const key = buildKey(editing && slot ? { ...slot, label: t(slot.label) } : slot, profile.revision, gestures, !editing);
      key.style.gridRow = `${position.row + 1} / span ${position.rows}`;
      key.style.gridColumn = `${position.column + 1} / span ${position.cols}`;
      if (editing) key.dataset.fixedEditing = '';
      return key;
    }
    keysEl.replaceChildren(
      ...layout.keys.map(({ index, layout: position }) => renderAt(index === null ? null : profile.slots[index], position)),
      ...quickLayout.editing.map(({ id, layout: position }) => renderAt(editingKeys.find((key) => key.id === id), position, true)),
    );
    const scope = JSON.stringify([profile.activity?.active, profile.page]);
    pageWidgets = layout.widgets.length ? window.LastraWidgets.mount(keysEl, layout.widgets, scope) : null;
    renderedSheet = quickSheet;
    updateWidgetVisibility();
  }

  function renderWidgetBar(view, gestures) {
    const instances = view.bar?.widgets ?? [];
    const slots = view.bar?.keys ?? [];
    const scope = view.activity?.active ?? '';
    const signature = JSON.stringify([scope, instances]);
    const keySignature = JSON.stringify([slots, gestures, view.viewOnly]);
    widgetBar.hidden = !instances.length && !slots.some(Boolean);
    const widgetsChanged = signature !== barSignature;
    if (widgetsChanged) {
      barSignature = signature;
      barWidgets?.destroy();
      barWidgets = instances.length ? window.LastraWidgets.mount(widgetBar, instances, scope) : null;
    }
    // Rebuilt with the widgets too so the keys stay after them in document order.
    if (!widgetsChanged && keySignature === barKeySignature) {
      refreshKeys(widgetBar, view.revision, false);
      updateWidgetVisibility();
      return;
    }
    barKeySignature = keySignature;
    for (const key of widgetBar.querySelectorAll('.key-cell')) key.remove();
    slots.forEach((slot, index) => {
      if (!slot) return;
      const key = buildKey(slot, view.revision, gestures);
      key.style.gridColumn = `${index + 1} / span ${slot.span?.cols ?? 1}`;
      key.style.gridRow = '1';
      widgetBar.append(key);
    });
    updateWidgetVisibility();
  }

  // Everything the page grid's layout and keys are built from except the revision and the target
  // window's availability, which refreshKeys applies to keys that stay mounted.
  function gridSignature() {
    if (signedProfile !== profile) {
      signedProfile = profile;
      profileSignature = JSON.stringify([window.LastraI18n.language, !api && profile.editorLayout, profile.shortcutPack, profile.shortcutPages, profile.grid, profile.slots,
        profile.widgets, profile.editingKeys, profile.gestures, profile.viewOnly, profile.page, profile.activity?.active]);
    }
    return profileSignature;
  }

  // ------------------------------------------------------------ scaling

  function fitStage() {
    const portrait = window.innerHeight > window.innerWidth;
    stage.classList.toggle('portrait', portrait);
    const width = portrait ? STAGE_H : STAGE_W;
    const height = portrait ? STAGE_W : STAGE_H;
    const scale = Math.min(window.innerWidth / width, window.innerHeight / height);
    stageScale = scale;
    const x = (window.innerWidth - width * scale) / 2;
    const y = (window.innerHeight - height * scale) / 2;
    stage.style.transform = `translate(${x}px, ${y}px) scale(${scale})`;
    if (!profile || deck.hidden) return;

    const signature = gridSignature();
    const authoring = !api && profile.editorLayout;
    const large = largeKeys && !authoring;
    keysEl.toggleAttribute('data-large-keys', large);
    if (gridLayout !== signature || gridPortrait !== portrait) {
      if (authoring) {
        const placement = projectPage(profile.grid, profile.slots, profile.widgets ?? [], profile.grid.cols);
        quickLayout = { ...profile.grid, sheets: [placement], editing: [] };
      } else if (profile.shortcutPack) {
        quickLayout = projectShortcutPages(profile.grid, profile.slots, portrait, large, profile.shortcutPages);
      } else {
        quickLayout = projectEditingPage(profile.grid, profile.slots, profile.widgets ?? [], portrait, large);
      }
      gridLayout = signature;
      gridPortrait = portrait;
      renderedSheet = undefined;
    }
    quickSheet = Math.min(quickSheet, quickLayout.sheets.length - 1);
    if (renderedSheet !== quickSheet) renderPageGrid();
    else refreshKeys(keysEl, profile.revision, profile.targetUnavailable);
    updatePageNavigation();
    const { cols, rows } = quickLayout;
    const { rowGap, columnGap } = getComputedStyle(keysEl);
    const horizontalGap = parseFloat(columnGap);
    const gridHeight = deck.clientHeight - pageNav.offsetHeight;
    const key = Math.min((gridHeight - (rows - 1) * parseFloat(rowGap)) / rows,
      (deck.clientWidth - (cols - 1) * horizontalGap) / cols);
    const cell = Math.max(1, Math.floor(key));
    keysEl.style.setProperty('--cols', cols);
    keysEl.style.setProperty('--key', `${cell}px`);
    pageNav.style.setProperty('--key-grid-width', `${cols * cell + (cols - 1) * horizontalGap}px`);
    if (!api && profile.editorLayout) viewSource.updateGeometry(keysEl, {
      cols, rows, cell, rowGap: parseFloat(rowGap), columnGap: horizontalGap, scale, revision: profile.revision,
    });
  }

  // ------------------------------------------------------------ status

  function showStatus(message, ok) {
    clearTimeout(statusTimer);
    const text = typeof message === 'string' ? t(message) : '';
    homeNotification.classList.toggle('err', Boolean(text && !ok));
    homeNotification.textContent = text;
    homeNotification.title = text;
    if (text) statusTimer = setTimeout(() => showStatus('', true), ok ? STATUS_MS : STATUS_MS * 2);
  }

  function showIdleStatus() {
    if (profile?.targetUnavailable) {
      statusEl.textContent = t('Bring the target window to the foreground.');
      return;
    }
    const activity = profile?.activity;
    const activeLabel = activity?.choices.find(({ id }) => id === activity.active)?.label;
    const name = profile?.name;
    const duplicate = typeof api?.selectActivity === 'function' && activeLabel
      && (name === activeLabel || name === t(activeLabel));
    statusEl.textContent = name && !duplicate ? t('Profile · {name}', { name }) : '';
  }

  // ------------------------------------------------------------ keys

  function acceptsPress(el, slot) {
    return Boolean(api) && !profile?.viewOnly && !quickTools.open && !changingSheet && el.isConnected && el.getAttribute('aria-disabled') !== 'true'
      && (!keysEl.hidden || slot.id.startsWith('bar:')) && !document.hidden
      && pendingFor(keyFeedback.get(slot.id)) < (slot.onBusy === 'queue-one' ? 2 : 1);
  }

  function closeKeyFeedback() {
    inspectedFeedback = null;
    if (feedbackDialog.open) feedbackDialog.close();
  }

  function pendingFor(entry) {
    return Math.max(entry?.pending ?? 0, entry?.controlId && Object.hasOwn(linkedPending, entry.controlId) ? linkedPending[entry.controlId] : 0);
  }

  function renderKeyFeedback(entry) {
    const pending = pendingFor(entry);
    const state = entry.unavailable ? 'unavailable' : pending ? 'pending' : entry.last?.state;
    const failed = !pending && (state === 'error' || (state === 'unavailable' && entry.last?.state === 'unavailable'));
    entry.badge.hidden = !failed;
    entry.action.setAttribute('aria-busy', String(pending > 0));
    if (failed) {
      entry.badge.dataset.state = state;
      entry.badge.title = `${entry.label} · ${t(feedbackLabels[state])}`;
      entry.badge.setAttribute('aria-label', t('{name}. Show action details', { name: entry.badge.title }));
    } else delete entry.badge.dataset.state;
    if (inspectedFeedback !== entry) return;
    if (!state) {
      closeKeyFeedback();
      return;
    }
    const progress = state === 'pending' ? entry.progress : undefined;
    const live = flowFeedback(progress);
    const label = live.label || t(feedbackLabels[state]);
    feedbackTitle.textContent = entry.label;
    feedbackState.textContent = state === 'pending' && pending > 1 ? t('{label} · One press queued', { label }) : label;
    feedbackStopFlow.hidden = !progress || profile?.viewOnly === true;
    feedbackStopFlow.disabled = progress?.stopping === true;
    const last = state === 'pending' || entry.unavailable ? null : entry.last;
    feedbackMessage.textContent = entry.unavailable ?? last?.message ?? live.detail;
    feedbackSteps.replaceChildren(...(last?.steps?.length ? [window.LastraActionHistory.renderStepResults(last)] : []));
  }

  function inspectKeyFeedback(entry) {
    if (!entry || feedbackDialog.open || confirmationDialog.open) return;
    inspectedFeedback = entry;
    renderKeyFeedback(entry);
    if (inspectedFeedback) feedbackDialog.showModal();
  }

  // A revision change clears keyFeedback, so a key that stays mounted registers a fresh entry and
  // any result still in flight for the old entry is treated as superseded.
  function registerKeyFeedback(action, badge, slot, unavailable) {
    const entry = keyFeedback.get(slot.id) ?? { pending: 0, ticket: 0 };
    Object.assign(entry, { action, badge, label: slot.label, unavailable, controlId: slot.controlId });
    keyFeedback.set(slot.id, entry);
    renderKeyFeedback(entry);
  }

  function keyCell(action, slot, unavailable) {
    const cell = document.createElement('div');
    cell.className = 'key-cell';
    const badge = document.createElement('button');
    badge.type = 'button';
    badge.className = 'key-feedback';
    const symbol = document.createElement('span');
    symbol.setAttribute('aria-hidden', 'true');
    symbol.textContent = '×';
    badge.append(symbol);
    cell.append(action, badge);
    mountedKeys.get(action).badge = badge;
    badge.addEventListener('click', () => {
      const entry = keyFeedback.get(slot.id);
      if (badge.isConnected && entry?.badge === badge) inspectKeyFeedback(entry);
    });
    registerKeyFeedback(action, badge, slot, unavailable);
    return cell;
  }

  document.getElementById('key-feedback-close').addEventListener('click', closeKeyFeedback);
  feedbackStopFlow.addEventListener('click', async () => {
    if (!inspectedFeedback?.progress || feedbackStopFlow.disabled) return;
    try { await api.stopFlow(inspectedFeedback.action.dataset.id, profile.revision); }
    catch (error) { showStatus(error.message, false); }
  });
  feedbackDialog.addEventListener('cancel', (event) => {
    event.preventDefault();
    closeKeyFeedback();
  });

  function recordKeyResult(entry, ticket, result, state) {
    const failed = state === 'error' || state === 'unavailable';
    const message = result.message || (failed ? 'The action failed.' : '');
    entry.last = { ...result, state, message, ticket };
    if (failed) keyErrorStatus.textContent = `${entry.label}: ${t(message)}`;
  }

  async function trigger(el, slot, kind, revision, confirmationToken, trace) {
    if (!acceptsPress(el, slot)) return;
    const entry = keyFeedback.get(slot.id);
    const ticket = ++entry.ticket;
    entry.pending++;
    keyErrorStatus.textContent = '';
    renderKeyFeedback(entry);
    let result;
    try {
      result = await api.press(slot.id, kind, revision, confirmationToken, trace);
    } catch (err) {
      result = { ok: false, message: err.message };
    } finally {
      entry.pending--;
    }
    if (keyFeedback.get(slot.id) !== entry) {
      measurement.outcome(trace, 'superseded');
      return;
    }
    const state = result?.unavailable ? 'unavailable' : result?.cancelled ? 'cancelled' : result?.ok ? 'success' : 'error';
    measurement.outcome(trace, result?.ignored ? 'ignored' : state);
    const finishedFlow = entry.progress && !entry.pending;
    if (finishedFlow) entry.progress = undefined;
    if (result && !result.ignored && (!entry.last || ticket > entry.last.ticket)) {
      recordKeyResult(entry, ticket, result, state);
    }
    if (finishedFlow) renderQuickTools();
    renderKeyFeedback(entry);
    if (entry.last?.ticket === ticket) measurement.painted(trace, 'feedback', entry.badge, state);
    return result;
  }

  function cancelToken(token) {
    if (token) void api.cancelKeyConfirmation(token).catch(() => {});
  }

  function closeConfirmation({ keepToken = false } = {}) {
    const prompt = pendingConfirmation;
    if (!prompt) return;
    pendingConfirmation = null;
    clearTimeout(prompt.timer);
    confirmationDialog.close();
    if (!keepToken) cancelToken(prompt.token);
  }

  async function promptConfirmation(el, slot, revision) {
    if (pendingConfirmation || !acceptsPress(el, slot)) return;
    keyErrorStatus.textContent = '';
    const prompt = { el, slot, revision };
    const armedAt = performance.now() + PROMPT_ARM_MS;
    pendingConfirmation = prompt;
    confirmationText.textContent = t('Run “{key}”?', { key: slot.label });
    confirmationRun.disabled = true;
    document.dispatchEvent(new Event('lastra-key-confirmation-open'));
    confirmationDialog.showModal();
    // Let the touch's compatibility mouse events finish before restoring focus.
    requestAnimationFrame(() => {
      if (pendingConfirmation === prompt && document.activeElement === confirmationDialog) {
        confirmationCancel.focus({ preventScroll: true });
      }
    });
    try {
      const result = await api.beginKeyConfirmation(slot.id, revision);
      if (pendingConfirmation !== prompt) {
        cancelToken(result.token);
        return;
      }
      if (!result.ok) throw new Error(result.message);
      prompt.token = result.token;
      // A quick repeated tap on the deck must not click through to Run action.
      prompt.timer = setTimeout(() => { confirmationRun.disabled = false; }, Math.max(0, armedAt - performance.now()));
    } catch (err) {
      if (pendingConfirmation !== prompt) return;
      closeConfirmation();
      const entry = keyFeedback.get(slot.id);
      if (!entry) return;
      recordKeyResult(entry, ++entry.ticket, { ok: false, message: err.message }, 'error');
      renderKeyFeedback(entry);
    }
  }

  confirmationDialog.addEventListener('cancel', (event) => {
    event.preventDefault();
    closeConfirmation();
  });
  confirmationCancel.addEventListener('click', () => closeConfirmation());
  confirmationRun.addEventListener('click', () => {
    const prompt = pendingConfirmation;
    if (confirmationRun.disabled || !prompt?.token) return;
    const ready = acceptsPress(prompt.el, prompt.slot);
    closeConfirmation({ keepToken: ready });
    if (ready) trigger(prompt.el, prompt.slot, 'confirm', prompt.revision, prompt.token);
  });
  window.addEventListener('blur', () => closeConfirmation());
  window.addEventListener('pagehide', () => closeConfirmation());
  document.addEventListener('visibilitychange', () => { if (document.hidden) closeConfirmation(); });

  function isInside(el, e) {
    const r = el.getBoundingClientRect();
    return e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
  }

  function bindKey(el, slot, state, gestures) {
    let pointerId = null;
    let startX = 0;
    let startY = 0;
    let cancelDistance = 0;
    let holdTimer = null;
    let tapTimer = null;
    let holdFired = false;
    let releasePending = false;
    let repeatContact;
    let contact = null;
    const holdToConfirm = slot.confirm === 'hold';
    const run = (kind, trace) => {
      if (slot.confirm === 'prompt') void promptConfirmation(el, slot, state.revision);
      else return trigger(el, slot, kind, state.revision, undefined, trace);
    };
    const reset = () => {
      pointerId = null;
      repeatContact = null;
      clearTimeout(holdTimer);
      el.classList.remove('pressed', 'holding');
    };

    async function repeatWhileHeld(current, delay, trace) {
      if (repeatContact !== current || !acceptsPress(el, slot)) return;
      const result = await run('tap', trace);
      if (repeatContact !== current || result?.ok !== true) return;
      holdTimer = setTimeout(() => void repeatWhileHeld(current, Math.max(90, delay - 45)), delay);
    }

    el.addEventListener('pointerdown', (e) => {
      const trace = measurement.contact(e);
      if (pointerId !== null || e.button !== 0 || !acceptsPress(el, slot)) return;
      contact = trace;
      pointerId = e.pointerId;
      startX = e.clientX;
      startY = e.clientY;
      cancelDistance = gestures.cancelDistance * stageScale;
      el.setPointerCapture(e.pointerId);
      holdFired = false;
      releasePending = false;
      el.classList.add('pressed');
      if (slot.hasRelease) {
        releasePending = true;
        void run('press', trace);
        return;
      }
      if (slot.hasHold || holdToConfirm || slot.repeatOnHold) {
        el.classList.add('holding');
        const current = repeatContact = Symbol('key contact');
        holdTimer = setTimeout(() => {
          holdFired = true;
          if (el.isConnected && swipe?.id === pointerId) swipe.holdFired = true;
          el.classList.remove('holding');
          if (slot.repeatOnHold) void repeatWhileHeld(current, 310, trace);
          else run(holdToConfirm ? 'confirm' : 'hold', trace);
        }, holdToConfirm ? slot.confirmMs ?? gestures.confirmMs : gestures.holdMs);
      }
    });

    function release(e, commit) {
      if (e.pointerId !== pointerId) return;
      const trace = contact;
      const pendingRelease = releasePending;
      releasePending = false;
      reset();
      if (slot.hasRelease) {
        if (pendingRelease) void run('release', trace);
        return;
      }
      if (!commit || holdFired || holdToConfirm || movedTooFar(e) || !isInside(el, e)) return;
      if (!slot.hasDouble) run('tap', trace);
      else if (tapTimer !== null) {
        clearTimeout(tapTimer);
        tapTimer = null;
        run('double', trace);
      } else {
        tapTimer = setTimeout(() => {
          tapTimer = null;
          run('tap', trace);
        }, gestures.doubleTapMs);
      }
    }
    function movedTooFar(event) {
      return Math.hypot(event.clientX - startX, event.clientY - startY) >= cancelDistance;
    }
    el.addEventListener('pointermove', (e) => {
      if (e.pointerId !== pointerId || (!movedTooFar(e) && isInside(el, e))) return;
      if (slot.hasRelease && releasePending) release(e, false);
      else reset();
    });
    el.addEventListener('pointerup', (e) => release(e, true));
    el.addEventListener('pointercancel', (e) => release(e, false));
    el.addEventListener('lostpointercapture', (e) => release(e, false));
    el.addEventListener('lastra:swipe-cancel', () => {
      reset();
      clearTimeout(tapTimer);
      tapTimer = null;
    });
    // Sent when the key stays mounted across a revision change: drop the gesture exactly as
    // removing the element would, including the pointer capture, so nothing started under the old
    // revision can fire under the new one.
    el.addEventListener(GESTURE_CANCEL, () => {
      const captured = pointerId;
      reset();
      clearTimeout(tapTimer);
      tapTimer = null;
      if (captured !== null && el.hasPointerCapture(captured)) el.releasePointerCapture(captured);
    });
  }

  function keyUnavailable(slot, targetUnavailable) {
    return targetUnavailable ? 'The target window is unavailable.' : slot.unavailable;
  }

  // Everything on a key that depends on whether it can run right now. Used when the key is built
  // and again when only the target window's availability changes.
  function describeKey(el, slot, unavailable) {
    if (slot.shortcut || unavailable) el.title = [slot.label, slot.shortcut, unavailable].filter(Boolean).join(' · ');
    else el.removeAttribute('title');
    if (unavailable || profile?.viewOnly) el.setAttribute('aria-disabled', 'true');
    else el.removeAttribute('aria-disabled');
    el.toggleAttribute('data-view-only-key', Boolean(profile?.viewOnly && !unavailable));
    if (slot.confirm || slot.hasHold || slot.hasDouble || slot.repeatOnHold || unavailable || slot.shortcut) {
      el.setAttribute('aria-description', [
        slot.shortcut ? 'Shortcut ' + slot.shortcut : '',
        slot.confirm === 'hold' ? 'Hold to confirm' : slot.confirm === 'prompt' ? 'Opens a confirmation dialog' : '',
        slot.hasHold ? 'Long-press action available' : '',
        slot.repeatOnHold ? 'Hold to repeat' : '',
        slot.hasDouble ? 'Double-tap action available' : '',
        unavailable,
      ].filter(Boolean).join('. '));
    } else el.removeAttribute('aria-description');
    const parts = liveKeyParts.get(el);
    if (parts) {
      // renderLiveKeys decorates title and description from these base values.
      parts.unavailable = unavailable;
      parts.title = el.title;
      parts.description = el.getAttribute('aria-description') ?? '';
    }
  }

  // Updates keys that stay mounted: the current revision for their next trigger (cancelling any
  // gesture begun under the previous one), the target window's availability and feedback entries.
  function refreshKeys(container, revision, targetUnavailable) {
    let changed = false;
    for (const el of container.querySelectorAll('.key')) {
      const state = mountedKeys.get(el);
      if (!state) continue;
      const moved = state.revision !== revision;
      if (moved) {
        el.dispatchEvent(new Event(GESTURE_CANCEL));
        state.revision = revision;
      }
      const unavailable = keyUnavailable(state.slot, state.targetBound && targetUnavailable);
      const availabilityChanged = unavailable !== state.unavailable;
      if (availabilityChanged) {
        state.unavailable = unavailable;
        describeKey(el, state.slot, unavailable);
        changed = true;
      }
      if (moved || availabilityChanged || !keyFeedback.has(state.slot.id)) registerKeyFeedback(el, state.badge, state.slot, unavailable);
    }
    if (changed) renderLiveKeys();
  }

  // targetBound keys show the page's target window as unavailable while it is not in the foreground.
  function buildKey(slot, revision, gestures, targetBound = false) {
    if (!slot) {
      const hole = document.createElement('div');
      hole.className = 'slot-empty';
      return hole;
    }
    const el = document.createElement('button');
    el.type = 'button';
    el.className = 'key';
    if (slot.hasHold || slot.repeatOnHold) el.classList.add('has-hold');
    if (slot.confirm) el.classList.add('needs-confirm');
    if (slot.confirm === 'hold' && slot.confirmMs !== undefined) el.style.setProperty('--confirm-ms', `${slot.confirmMs}ms`);
    if (slot.hasDouble) el.classList.add('has-double');
    el.dataset.cat = slot.category;
    el.dataset.id = slot.id;
    const unavailable = keyUnavailable(slot, targetBound && profile?.targetUnavailable);
    // The revision lives here rather than in the listeners so refreshKeys can move a mounted key on.
    const state = { slot, revision, unavailable, targetBound, badge: null };
    mountedKeys.set(el, state);
    if (slot.audio) el.dataset.audio = slot.audio;

    const glyph = document.createElement('span');
    glyph.className = 'glyph';
    if (slot.image) {
      const img = document.createElement('img');
      img.src = slot.image;
      img.alt = '';
      glyph.append(img);
    } else if (slot.icon) {
      glyph.innerHTML = slot.icon; // The main process reads this SVG from the local Lucide package.
    }

    const label = document.createElement('span');
    label.className = 'label';
    label.textContent = slot.label;

    const bar = document.createElement('span');
    bar.className = 'hold-bar';

    el.append(glyph, label, bar);
    const liveSource = slot.liveSource ?? slot.audio;
    if (liveSource || slot.readout) {
      if (liveSource) el.dataset.liveSource = liveSource;
      if (slot.readout) {
        el.dataset.readout = slot.readout;
        el.toggleAttribute('data-sensor-readout', Object.hasOwn(window.LastraKeyReadouts.SENSOR_READOUTS, slot.readout));
      }
      const stateLabel = document.createElement('span');
      stateLabel.className = 'key-live-state';
      el.append(stateLabel);
      liveKeyParts.set(el, { label, stateLabel, glyph, baseLabel: slot.label, icons: slot.stateIcons, baseIcon: slot.icon, icon: slot.icon,
        controlId: slot.controlId, sceneTarget: slot.sceneTarget, timer: slot.timer, sound: slot.sound, unavailable });
    }
    describeKey(el, slot, unavailable);
    bindKey(el, slot, state, gestures);
    el.addEventListener('click', (e) => {
      if (e.detail !== 0) return;
      if (slot.confirm === 'prompt') void promptConfirmation(el, slot, state.revision);
      else if (slot.confirm !== 'hold') trigger(el, slot, 'tap', state.revision);
    });
    if (slot.confirm === 'hold') {
      let keyboardTimer = null;
      let keyboardKey = null;
      const clear = () => {
        clearTimeout(keyboardTimer);
        keyboardKey = null;
        el.classList.remove('holding', 'pressed');
      };
      el.addEventListener('keydown', (e) => {
        if (e.key !== ' ' && e.key !== 'Enter') return;
        e.preventDefault();
        if (e.repeat || keyboardKey !== null || !acceptsPress(el, slot)) return;
        keyboardKey = e.key;
        el.classList.add('holding', 'pressed');
        keyboardTimer = setTimeout(() => {
          clear();
          trigger(el, slot, 'confirm', state.revision);
        }, slot.confirmMs ?? gestures.confirmMs);
      });
      el.addEventListener('keyup', (e) => {
        if (e.key === keyboardKey) clear();
      });
      el.addEventListener('blur', clear);
      el.addEventListener('lastra:swipe-cancel', clear);
      el.addEventListener(GESTURE_CANCEL, clear);
    }
    return keyCell(el, slot, unavailable);
  }

  const home = document.getElementById('home-page');
  const previous = document.getElementById('previous');
  const next = document.getElementById('next');
  const lock = document.getElementById('page-lock');
  const pageName = document.getElementById('page-name');
  const sessionCover = document.getElementById('windows-session-cover');
  sessionCover.addEventListener('cancel', (event) => event.preventDefault());
  const heldRanges = new Map();
  const cancelledRanges = new WeakSet();
  const isRange = (target) => target instanceof HTMLInputElement && target.type === 'range';
  window.addEventListener('pointerdown', (event) => {
    if (!event.isTrusted || !isRange(event.target)) return;
    cancelledRanges.delete(event.target);
    heldRanges.set(event.pointerId, event.target);
  }, true);
  for (const type of ['pointerup', 'pointercancel']) {
    window.addEventListener(type, ({ pointerId }) => heldRanges.delete(pointerId), true);
  }
  window.addEventListener('keydown', (event) => {
    if (sessionCover.open) {
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }
    if (event.isTrusted && isRange(event.target)) cancelledRanges.delete(event.target);
  }, true);
  window.addEventListener('change', (event) => {
    if (sessionCover.open || cancelledRanges.has(event.target)) event.stopImmediatePropagation();
  }, true);
  const pageCount = document.getElementById('page-count');
  const pageMatch = document.getElementById('page-match');
  const pageIcon = document.getElementById('page-app-icon');
  const matchLabels = {
    locked: 'The page is locked.', manual: 'This is the current manual page.',
    title: window.LastraI18n.t('The foreground window matched a title rule.'),
    'app-id': 'The foreground app matched a Windows app ID.',
    executable: 'The foreground app matched an executable rule.',
    pack: 'The foreground app matched a built-in shortcut pack.',
    generic: 'The foreground app is using common shortcuts.',
  };

  function showPageMatch(open) {
    pageMatch.hidden = !open;
    pageCount.setAttribute('aria-expanded', String(open));
  }

  pageCount.addEventListener('click', () => showPageMatch(pageMatch.hidden));
  document.addEventListener('pointerdown', (event) => {
    if (!pageMatch.hidden && !pageCount.contains(event.target) && !pageMatch.contains(event.target)) showPageMatch(false);
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !pageMatch.hidden) showPageMatch(false);
  });

  function renderPageIcon(source) {
    pageIcon.hidden = !source;
    if (source) {
      if (pageIcon.getAttribute('src') !== source) pageIcon.src = source;
    } else pageIcon.removeAttribute('src');
  }

  function selectPage(destination) {
    if (!destination) return;
    closeActiveView();
    if (profile.page !== destination.id) {
      api.selectPage(destination.id).catch((err) => showStatus(err.message, false));
    } else if (quickSheet) changeQuickSheet(0);
  }

  const directory = document.getElementById('page-directory');
  const directoryOpen = document.getElementById('page-directory-open');
  const directoryList = document.getElementById('page-directory-list');
  const directoryError = document.getElementById('page-directory-error');
  const directoryPath = document.getElementById('page-directory-path');
  const pageFolder = document.getElementById('page-folder');
  let directorySignature;
  let directoryFolder = [];

  function closePageDirectory() {
    if (directory.open) directory.close();
  }

  function openDirectoryPage(id) {
    const activity = profile.activity?.active ?? null;
    closePageDirectory();
    closeActiveView();
    void api.selectPage(id, activity).catch((error) => showStatus(error.message, false));
  }

  function browseDirectoryFolder(path) {
    directoryFolder = path;
    directoryError.textContent = '';
    renderPageDirectory();
    directoryList.scrollTop = 0;
    (directoryPath.querySelector('[aria-current]') ?? document.getElementById('page-directory-title')).focus();
  }

  function renderPageDirectory() {
    if (!directory.open || !profile?.pageShortcuts) return;
    const { favorites, recent } = profile.pageShortcuts;
    function underFolder({ folder = [] }) {
      return directoryFolder.every((label, index) => label === folder[index]);
    }
    while (directoryFolder.length && !profile.pages.some(underFolder)) directoryFolder = directoryFolder.slice(0, -1);
    const signature = JSON.stringify([profile.activity?.active, profile.pages, profile.page, favorites, recent, profile.viewOnly, directoryFolder]);
    if (directorySignature === signature) return;
    directorySignature = signature;
    const pageById = new Map(profile.pages.map((page) => [page.id, page]));
    const remaining = new Set(pageById.keys());
    const make = (tag, text) => Object.assign(document.createElement(tag), { textContent: text });
    const folderButton = (label, path) => {
      const button = make('button', label);
      button.type = 'button';
      button.addEventListener('click', () => browseDirectoryFolder(path));
      return button;
    };
    const groups = [];
    const depth = directoryFolder.length;
    directoryPath.hidden = depth === 0;
    const trail = depth ? [folderButton('All pages', [])] : [];
    directoryFolder.forEach((label, index) => {
      const separator = make('span', '›');
      separator.setAttribute('aria-hidden', 'true');
      if (index < depth - 1) trail.push(separator, folderButton(label, directoryFolder.slice(0, index + 1)));
      else {
        const current = make('span', label);
        current.setAttribute('aria-current', 'location');
        current.tabIndex = -1;
        trail.push(separator, current);
      }
    });
    directoryPath.replaceChildren(...trail);

    const directPages = [];
    const childFolders = new Set();
    for (const entry of profile.pages.filter(underFolder)) {
      const child = entry.folder?.[depth];
      if (child) childFolders.add(child);
      else directPages.push(entry.id);
    }
    const sections = depth ? [['Pages in this folder', directPages]]
      : [['Favorites', favorites], ['Recently opened', recent], ['Other pages', directPages]];
    for (const [title, ids] of sections) {
      const list = make('ul', '');
      for (const id of ids) {
        if (!remaining.delete(id)) continue;
        const { name, folder } = pageById.get(id);
        const item = make('li', '');
        item.className = 'page-directory-row';
        const page = make('button', name);
        page.type = 'button';
        if (!depth && folder?.length) page.append(make('small', folder.join(' / ')));
        if (profile.page === id) page.setAttribute('aria-current', 'page');
        page.addEventListener('click', () => openDirectoryPage(id));
        item.append(page);
        list.append(item);
      }
      if (list.childElementCount) {
        const group = make('section', '');
        group.append(make('h3', title), list);
        groups.push(group);
      }
    }
    if (childFolders.size) {
      const list = make('ul', '');
      for (const label of childFolders) {
        const item = make('li', '');
        const folder = folderButton(label, [...directoryFolder, label]);
        folder.className = 'page-directory-folder';
        item.append(folder);
        list.append(item);
      }
      const group = make('section', '');
      group.append(make('h3', 'Folders'), list);
      groups.unshift(group);
    }
    directoryList.replaceChildren(...groups);
  }

  directoryOpen.addEventListener('click', () => {
    if (!api || !profile?.pageShortcuts) return;
    closeKeyFeedback();
    closeConfirmation();
    directoryError.textContent = '';
    directorySignature = undefined;
    directoryFolder = profile.pages.find(({ id }) => id === profile.page)?.folder ?? [];
    directory.showModal();
    renderPageDirectory();
  });
  document.getElementById('page-directory-home').addEventListener('click', () => {
    if (profile?.pages[0]) openDirectoryPage(profile.pages[0].id);
  });
  document.getElementById('page-directory-close').addEventListener('click', closePageDirectory);
  document.addEventListener('visibilitychange', () => { if (document.hidden) closePageDirectory(); });

  function changeQuickSheet(index) {
    if (!api || changingSheet || quickSheet === index) return;
    quickTools.close();
    closeActiveView();
    const before = quickSheet;
    const page = profile.page;
    quickSheet = index;
    changingSheet = true;
    void api.repaginatePage(index).then(fitStage).catch((err) => {
      if (profile.page === page) quickSheet = before;
      fitStage();
      showStatus(err.message, false);
    }).finally(() => { changingSheet = false; });
  }

  function shiftPage(offset) {
    if (!profile || changingSheet) return;
    const sheet = quickSheet + offset;
    if (0 <= sheet && sheet < (quickLayout?.sheets.length ?? 1)) {
      changeQuickSheet(sheet);
      return;
    }
    if (profile.shortcutPack) return;
    const index = profile.pages.findIndex(({ id }) => id === profile.page);
    const fallback = profile.pages.find(({ id }) => id === profile.manualPage) ?? profile.pages[0];
    selectPage(index < 0 ? fallback : profile.pages[index + offset]);
  }

  home.addEventListener('click', () => selectPage(profile?.pages[0]));
  previous.addEventListener('click', () => shiftPage(-1));
  next.addEventListener('click', () => shiftPage(1));
  lock.addEventListener('click', () => api.lockPage().catch((err) => showStatus(err.message, false)));

  let wheelGesture;
  keysEl.addEventListener('wheel', (event) => {
    if (!api || !profile || keysEl.hidden || event.ctrlKey || document.hidden || document.querySelector('dialog[open]')
        || event.target.closest('.lastra-widget')) return;
    const delta = Math.abs(event.deltaX) >= Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
    const direction = Math.sign(delta);
    if (!direction || (direction < 0 ? previous.disabled : next.disabled)) return;
    event.preventDefault();
    const now = event.timeStamp;
    if (!wheelGesture || now - wheelGesture.at >= WHEEL_GESTURE_GAP || wheelGesture.direction !== direction) {
      wheelGesture = { at: now, direction, distance: 0, used: false };
    }
    wheelGesture.at = now;
    if (wheelGesture.used || changingSheet) return;
    const unit = event.deltaMode === 0 ? 1 : event.deltaMode === 1 ? 16 : WHEEL_PAGE_DISTANCE;
    wheelGesture.distance += Math.abs(delta) * unit;
    if (wheelGesture.distance < WHEEL_PAGE_DISTANCE) return;
    wheelGesture.used = true;
    shiftPage(direction);
  }, { passive: false });

  keysEl.addEventListener('pointerdown', (event) => {
    if (event.pointerType !== 'touch' || !event.isPrimary || swipe || !profile) return;
    if (event.target.closest('.lastra-widget, .key-feedback')) return;
    const key = event.target.closest('.key');
    let reveal = false;
    if (api && profile.desktopRevealGesture) {
      const edge = REVEAL_EDGE * stageScale;
      const lastKey = key && Array.from(keysEl.children).findLast((cell) => cell.hasAttribute('data-fixed-editing'));
      reveal = keysEl.getBoundingClientRect().bottom - event.clientY <= edge
        || Boolean(lastKey && Math.abs(lastKey.getBoundingClientRect().bottom - event.clientY) <= edge);
    }
    if (!reveal && previous.disabled && next.disabled) return;
    if (!key) keysEl.setPointerCapture(event.pointerId);
    swipe = {
      id: event.pointerId, x: event.clientX, y: event.clientY,
      scale: stageScale,
      cancelDistance: (profile.gestures ?? DEFAULT_GESTURES).cancelDistance,
      key, reveal, cancelledKey: false, holdFired: false,
    };
  }, { capture: true });

  function updateSwipe(event) {
    const dx = (event.clientX - swipe.x) / swipe.scale;
    const dy = (event.clientY - swipe.y) / swipe.scale;
    if (!swipe.cancelledKey && Math.hypot(dx, dy) >= swipe.cancelDistance) {
      swipe.cancelledKey = true;
      swipe.key?.dispatchEvent(new Event('lastra:swipe-cancel'));
    }
    return { dx, dy };
  }

  keysEl.addEventListener('pointermove', (event) => {
    if (swipe?.id === event.pointerId) updateSwipe(event);
  }, { capture: true });
  keysEl.addEventListener('pointerup', (event) => {
    if (swipe?.id !== event.pointerId) return;
    const { dx, dy } = updateSwipe(event);
    const reveal = swipe.reveal && !swipe.holdFired && -dy >= REVEAL_DISTANCE && -dy > Math.abs(dx) * 1.35;
    const navigate = !swipe.holdFired && Math.abs(dx) >= SWIPE_PAGE_DISTANCE && Math.abs(dx) > Math.abs(dy) * 1.35;
    swipe = null;
    if (reveal) void api.revealDesktop().catch((error) => showStatus(error.message, false));
    else if (navigate) shiftPage(dx < 0 ? 1 : -1);
  }, { capture: true });
  function clearSwipe(event) {
    if (swipe?.id === event.pointerId) swipe = null;
  }
  keysEl.addEventListener('pointercancel', clearSwipe, { capture: true });
  keysEl.addEventListener('lostpointercapture', clearSwipe, { capture: true });

  function updatePageNavigation() {
    const index = profile.pages.findIndex(({ id }) => id === profile.page);
    const automatic = profile.generatedPage === true;
    const useProfilePages = !profile.shortcutPack;
    const count = quickLayout?.sheets.length ?? 1;
    const group = quickLayout?.sheets[quickSheet]?.group;
    const part = count > 1 ? [group, t('Keys {index} / {count}', { index: quickSheet + 1, count })].filter(Boolean).join(' · ')
      : profile.shortcutPages ? group || '' : '';
    pageCount.textContent = profile.targetUnavailable ? [t('Target inactive'), part].filter(Boolean).join(' · ')
      : part || (automatic ? t('Auto') : profile.pages.length > 1 ? `${index + 1} / ${profile.pages.length}`
        : ['title', 'app-id', 'executable'].includes(profile.pageMatch?.reason) ? 'Rule' : '');
    pageCount.hidden = !pageCount.textContent;
    pageCount.title = pageCount.textContent;
    previous.disabled = !api || !(quickSheet > 0 || (useProfilePages && (automatic || index > 0)));
    next.disabled = !api || !(quickSheet + 1 < count || (useProfilePages && (automatic || index < profile.pages.length - 1)));
    previous.hidden = next.hidden = count === 1 && (!useProfilePages || (profile.pages.length === 1 && !automatic));
  }

  function renderProfile(view) {
    if (profile?.activity?.active !== view.activity?.active) closePageDirectory();
    if (profile && view.revision < profile.revision) return;
    closeConfirmation();
    if (profile?.page !== view.page || profile?.activity?.active !== view.activity?.active) quickTools.close();
    if (profile?.viewOnly !== view.viewOnly || view.desktopRevealed) quickTools.close();
    if (profile?.revision !== view.revision) {
      closeKeyFeedback();
      keyFeedback.clear();
    }
    swipe = null;
    if (profile?.page !== view.page || profile.activity?.active !== view.activity?.active
      || profile?.editorActive !== view.editorActive) quickSheet = 0;
    if (!api && view.editorActive) quickSheet = view.deckSheet ?? 0;
    profile = view;
    const sessionBlocked = view.sessionBlocked === true;
    if (sessionBlocked !== sessionCover.open) {
      if (sessionBlocked) {
        for (const [pointerId, range] of heldRanges) {
          cancelledRanges.add(range);
          range.dispatchEvent(new PointerEvent('pointercancel', { pointerId, bubbles: true }));
        }
        for (const modal of document.querySelectorAll('dialog[open]')) modal.close();
        sessionCover.showModal();
      } else sessionCover.close();
      document.dispatchEvent(new CustomEvent('lastra:session-blocked', { detail: sessionBlocked }));
    }
    window.LastraViewOnly.set(view.viewOnly === true);
    renderQuickTools();
    linkedPending = view.linkedPending ?? {};
    window.LastraActivityProfile.render(view.activity);
    const gestures = view.gestures ?? DEFAULT_GESTURES;
    stage.style.setProperty('--hold-ms', `${gestures.holdMs}ms`);
    stage.style.setProperty('--confirm-ms', `${gestures.confirmMs}ms`);
    renderWidgetBar(view, gestures);
    const index = view.pages.findIndex(({ id }) => id === view.page);
    pageName.textContent = view.pageName ?? view.pages[index]?.name ?? window.LastraI18n.t('Deck');
    pageFolder.textContent = (view.pages[index]?.folder ?? []).join(' / ');
    pageFolder.hidden = pageFolder.textContent === '';
    pageFolder.title = pageFolder.textContent;
    pageName.title = pageFolder.hidden ? pageName.textContent : `${pageFolder.textContent} / ${pageName.textContent}`;
    renderPageIcon(view.pageIcon);
    if (view.pageMatch) {
      const { reason, priority } = view.pageMatch;
      const detail = t(view.targetUnavailable ? 'The target window is inactive.' : matchLabels[reason]);
      const contextual = ['title', 'app-id', 'executable'].includes(reason);
      pageMatch.textContent = detail + (contextual && !view.targetUnavailable ? ' ' + t('Rule priority {number}.', { number: priority }) : '');
    }
    showPageMatch(false);
    pageCount.toggleAttribute('data-unavailable', Boolean(view.targetUnavailable));
    home.disabled = !api;
    directoryOpen.disabled = !api || !view.pageShortcuts;
    renderPageDirectory();
    lock.hidden = !view.followsApps;
    const lockLabel = t(view.locked ? 'Unlock page' : 'Lock page');
    lock.title = lockLabel;
    lock.setAttribute('aria-label', lockLabel);
    lock.setAttribute('aria-pressed', String(view.locked));
    fitStage();
    if (audio) renderAudio(audio);
    showIdleStatus();
    updateClock();
  }

  // ------------------------------------------------------------ audio
  let preferredInputId;

  function selectedInput(state) {
    return state.inputs?.find((input) => input.id === preferredInputId)
      ?? state.inputs?.find((input) => input.id === state.microphone?.id)
      ?? state.microphone;
  }

  document.addEventListener('lastra-microphone-choice', ({ detail }) => {
    preferredInputId = detail;
    if (audio) renderAudio(audio);
  });

  const mixer = [...document.querySelectorAll('#mixer > .audio-channel')].map((channel) => {
    const device = channel.dataset.device;
    const slider = channel.querySelector('input');
    const value = channel.querySelector('output');
    let drag = null;

    function currentInputId() {
      if (device !== 'microphone' || !audio) return undefined;
      return preferredInputId === null ? null : selectedInput(audio)?.id;
    }

    async function change(level, inputId) {
      try {
        const result = await api.changeAudio(device, level, inputId);
        if (result.ok && result.message) showStatus(result.message, true);
        if (!result.ok) {
          showStatus(result.message, false);
          if (audio) renderAudio(audio);
        }
      } catch (err) {
        showStatus(err.message, false);
      }
    }

    slider.addEventListener('pointerdown', ({ pointerId, isPrimary, button }) => {
      if (isPrimary && button === 0) drag = { pointerId, inputId: currentInputId() };
    });
    window.addEventListener('pointerup', ({ pointerId }) => {
      if (drag?.pointerId !== pointerId) return;
      const released = drag;
      // The browser can dispatch the range input's change after pointerup.
      setTimeout(() => {
        if (drag !== released) return;
        drag = null;
        if (audio) renderAudio(audio);
      }, 0);
    });
    window.addEventListener('pointercancel', ({ pointerId }) => {
      if (drag?.pointerId !== pointerId) return;
      drag = null;
      if (audio) renderAudio(audio);
    });
    slider.addEventListener('input', () => { value.textContent = `${slider.value}%`; });
    slider.addEventListener('change', () => {
      const currentId = currentInputId();
      const inputId = drag ? drag.inputId : currentId;
      drag = null;
      if (device === 'microphone' && (inputId === undefined || inputId !== currentId)) {
        if (audio) renderAudio(audio);
        return;
      }
      void change(Number(slider.value), inputId);
    });
    return { channel, device, slider, value, dragging: () => Boolean(drag) };
  });

  function renderAudio(state) {
    audio = state;
    clearTimeout(staleAudioTimer);
    const expiresIn = Number.isFinite(state.sampledAt) ? state.sampledAt + 3000 - Date.now() : 0;
    if (expiresIn > 0) staleAudioTimer = setTimeout(renderLiveKeys, expiresIn);
    const allMicrophones = preferredInputId === null;
    const input = selectedInput(state);
    const levels = allMicrophones ? (state.inputs ?? []).map(({ level }) => level).filter(Number.isFinite) : [];
    const average = levels.length ? Math.round(levels.reduce((sum, level) => sum + level, 0) / levels.length) : null;
    const mixed = levels.some((level) => level !== levels[0]);
    for (const { channel, device, slider, value, dragging } of mixer) {
      const isGroup = device === 'microphone' && allMicrophones;
      const endpoint = device === 'microphone' && !isGroup ? input : state[device];
      const level = isGroup ? average : endpoint?.level;
      slider.disabled = level == null;
      if (device === 'microphone') slider.setAttribute('aria-label', isGroup ? window.LastraI18n.t('All microphone levels') : window.LastraI18n.t('Microphone level'));
      channel.classList.toggle('muted', endpoint?.muted === true);
      if (!dragging()) {
        slider.value = level ?? 0;
        value.textContent = level == null ? 'N/A' : (isGroup && mixed ? '≈' : '') + level + '%';
      }
    }
    renderLiveKeys();
    document.dispatchEvent(new CustomEvent('lastra-microphone-selection', { detail: allMicrophones ? null : input ?? null }));
  }

  // ------------------------------------------------------------ clock

  let clockLocale;
  let clockFormatter;
  let showClockSeconds = false;

  function clockPart(className, text) {
    const span = document.createElement('span');
    span.className = className;
    span.textContent = text;
    return span;
  }

  function renderClockTime(clock, parts, compactPeriod) {
    if (clock.textContent === parts.map(({ value }) => value).join('')) return;
    clock.replaceChildren(...parts.flatMap(({ type, value }, index) => {
      if (type === 'literal' && parts[index + 1]?.type === 'second') return [];
      if (type === 'second') {
        const separator = parts[index - 1];
        return clockPart('clock-seconds', (separator?.type === 'literal' ? separator.value : '') + value);
      }
      if (type === 'dayPeriod' && compactPeriod) return clockPart('clock-period', value);
      return value;
    }));
  }

  function updateClock() {
    const now = new Date(viewSource?.fixtureTime ?? Date.now());
    const locale = profile?.locale || 'en-GB';
    if (!clockFormatter || clockLocale !== locale) {
      clockLocale = locale;
      clockFormatter = new Intl.DateTimeFormat(locale, {
        hour: '2-digit', minute: '2-digit', second: showClockSeconds ? '2-digit' : undefined,
      });
    }
    const parts = clockFormatter.formatToParts(now);
    const inStats = activeView === stats;
    const inDashboard = activeView === dashboard;
    const inFeeds = activeView === feedsPanel;
    if (inStats || inDashboard || inFeeds) {
      renderClockTime(document.getElementById('corner-time'), parts, showClockSeconds);
      const spacer = document.getElementById(inStats ? 'stats-time' : inDashboard ? 'dashboard-time' : 'feeds-time');
      if (inStats || inDashboard) renderClockTime(spacer, parts, showClockSeconds);
      const day = now.toLocaleDateString(locale, { weekday: 'short', month: 'short', day: 'numeric' });
      const cornerDate = document.getElementById('corner-date');
      if (cornerDate.textContent !== day) cornerDate.textContent = day;
      if (inStats) window.LastraStats?.updateDate(now, locale);
      if (inDashboard) window.LastraDashboard?.updateDate(now, locale);
      return;
    }
    const clock = document.getElementById('time');
    renderClockTime(clock, parts, true);
    document.getElementById('weekday').textContent =
      now.toLocaleDateString(locale, { weekday: 'long' });
    document.getElementById('date').textContent =
      now.toLocaleDateString(locale, { day: 'numeric', month: 'long' });
  }

  let clockTimer;

  // Ticks on each second boundary while the window is visible; a hidden window stops ticking and
  // refreshes as soon as it is shown again.
  function tickClock() {
    clearTimeout(clockTimer);
    clockTimer = undefined;
    if (document.hidden) return;
    updateClock();
    clockTimer = setTimeout(tickClock, 1000 - (Date.now() % 1000));
  }

  function startClock() {
    tickClock();
    document.addEventListener('visibilitychange', tickClock);
  }

  const renderSensors = window.createTelemetry();

  function updateTelemetryVisibility() {
    if (sidePanel.hidden || document.hidden) {
      stopTelemetry?.();
      stopTelemetry = undefined;
    } else {
      stopTelemetry ??= window.LastraWidgetProviders.telemetry.subscribe(renderSensors);
    }
  }

  document.addEventListener('visibilitychange', updateTelemetryVisibility);

  // ------------------------------------------------------------ preview

  function applyDemoStates() {
    document.body.classList.add('demo');
    const key = (id) => keysEl.querySelector(`[data-id="${id}"]`);
    key('terminal')?.classList.add('pressed');
    key('file-explorer')?.classList.add('pressed', 'holding');
    const entry = keyFeedback.get('start-meeting');
    if (entry) {
      entry.last = { ticket: 0, state: 'error', message: 'The action failed.' };
      renderKeyFeedback(entry);
    }
  }

  // ------------------------------------------------------------ startup

  document.addEventListener('contextmenu', (e) => e.preventDefault());
  window.addEventListener('resize', fitStage);
  let navigationHeight = pageNav.offsetHeight;
  new ResizeObserver(() => {
    const height = pageNav.offsetHeight;
    if (height === navigationHeight) return;
    navigationHeight = height;
    requestAnimationFrame(fitStage);
  }).observe(pageNav);
  fitStage();

  if (!viewSource) {
    statusEl.textContent = window.LastraI18n.t('Run “npm start” to use deck actions.');
    return;
  }

  viewSource.onProfile(renderProfile);
  api?.onDeckPageIcon?.(({ revision, source }) => {
    if (profile?.revision === revision) renderPageIcon(source);
  });
  if (api) viewSwitch.addEventListener('click', () => showPrimaryView(nextPrimaryView()));
  updateTelemetryVisibility();
  viewSource.onAudio(renderAudio);
  viewSource.onObs?.((view) => {
    obsState = view;
    renderLiveKeys();
  });
  api?.onLinkedControls?.((pending) => {
    linkedPending = pending;
    for (const entry of keyFeedback.values()) if (entry.controlId) renderKeyFeedback(entry);
  });
  api?.onFlowProgress?.(({ id, revision, progress }) => {
    if (profile?.revision !== revision) return;
    const entry = keyFeedback.get(id);
    if (!entry) return;
    const changed = Boolean(entry.progress) !== Boolean(progress);
    entry.progress = progress;
    renderKeyFeedback(entry);
    if (changed) renderQuickTools();
  });
  viewSource?.onDeckAppearance?.((appearance) => {
    window.LastraAppearance.applyAppearance(document.documentElement, appearance);
    const large = appearance.largeKeys === true;
    if (large !== largeKeys) {
      largeKeys = large;
      swipe = null;
      quickSheet = 0;
      gridLayout = undefined;
    }
    fitStage();
    if (showClockSeconds === appearance.showClockSeconds) return;
    showClockSeconds = appearance.showClockSeconds;
    clockFormatter = undefined;
    updateClock();
  });
  api?.onStatus((s) => showStatus(s.message, s.ok));
  api?.onDeckNavigation?.(applyDeckNavigation);
  api?.onLanguage?.(setLanguage);
  const updateOffer = document.getElementById('update-offer');
  const updateOfferText = document.getElementById('update-offer-text');
  const updateRestart = document.getElementById('update-offer-restart');
  function showUpdateOffer(status) {
    if (!updateOffer || !status || typeof status !== 'object') return;
    const version = status.version || '';
    if (status.state === 'downloaded') {
      updateOffer.hidden = false;
      updateOfferText.textContent = window.LastraI18n.t('Version {version} is ready.', { version });
      updateRestart.hidden = false;
    } else if (status.state === 'downloading') {
      updateOffer.hidden = false;
      updateOfferText.textContent = window.LastraI18n.t('Downloading update {version}.', { version });
      updateRestart.hidden = true;
    } else updateOffer.hidden = true;
  }
  updateRestart?.addEventListener('click', () => { void api?.restartToUpdate?.(); });
  api?.onUpdateStatus?.(showUpdateOffer);
  void api?.updateStatus?.().then(showUpdateOffer).catch(() => {});
  document.addEventListener('lastra-language', () => {
    updateViewSwitch();
    if (profile) renderProfile({ ...profile });
    for (const entry of keyFeedback.values()) renderKeyFeedback(entry);
  });
  document.addEventListener('lastra-microphone-notice', ({ detail }) => showStatus(detail, false));

  (async () => {
    const initial = await viewSource.getProfile();
    if (api) setLanguage(initial.uiLanguage);
    renderProfile(initial);
    if ((api || viewSource.fixtureTime) && initial.deckView) {
      if (document.readyState === 'loading') {
        await new Promise((resolve) => document.addEventListener('DOMContentLoaded', resolve, { once: true }));
      }
      applyDeckNavigation(pendingNavigation ?? { view: initial.deckView, statsTab: initial.deckStatsTab, sheet: initial.deckSheet });
      pendingNavigation = undefined;
    }
    startClock();
    await document.fonts.ready;
    if (demo) applyDemoStates();
    api?.ready();
  })().catch((err) => showStatus(err.message, false));
})();
