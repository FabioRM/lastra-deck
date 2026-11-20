'use strict';

(() => {
  const api = window.lastra ?? window.LastraDeckPreview?.panels;
  if (!api) return;
  const { t } = window.LastraI18n;

  const byId = (id) => document.getElementById('dashboard-' + id);
  const panel = byId('panel');
  const pomodoro = api.readDashboardPomodoro ? window.LastraPomodoro?.mount(byId('pomodoro'), api) : null;
  const agenda = api.dashboardAgenda ? window.LastraDashboardAgenda?.mount(byId('agenda'), api) : null;
  const dateLabel = byId('date');
  const calendar = window.LastraDashboardCalendar.createCalendar(byId('calendar'));
  const calendarButton = byId('calendar-open');
  const calendarFeedback = byId('calendar-feedback');
  const cover = byId('cover');
  const coverFallback = byId('cover-fallback');
  const track = byId('track');
  const playback = byId('playback');
  const artist = byId('artist');
  const album = byId('album');
  const source = byId('source');
  const timeline = byId('timeline');
  const progress = byId('progress');
  const seek = byId('seek');
  const elapsed = byId('elapsed');
  const duration = byId('duration');
  const previous = byId('previous');
  const play = byId('play');
  const next = byId('next');
  const playIcon = play.querySelector('.dashboard-icon-play');
  const pauseIcon = play.querySelector('.dashboard-icon-pause');
  const feedback = byId('media-feedback');
  const media = window.LastraWidgetProviders.media;
  const { position, time, source: sourceName } = window.LastraMediaHelpers;
  const { lastReading } = window.LastraReadingTime;
  const artwork = /^data:image\/(?:png|jpeg|gif|webp);base64,[A-Za-z0-9+/=]+$/;
  const playbackLabels = { playing: 'Playing', paused: 'Paused', stopped: 'Stopped', changing: 'Updating' };
  const statusLabels = { loading: 'Reading Windows media…', empty: 'No media playing', unsupported: 'Windows media unavailable' };
  const commandErrors = {
    changed: 'The player changed. Try again.',
    disabled: 'This player does not support that control.',
    rejected: 'The player did not accept the command.',
    busy: 'The player is busy. Try again.',
  };
  let snapshot = { status: 'loading' };
  let pending = false;
  let seekGesture;
  let requestedSeek;
  let viewVersion = 0;
  let unsubscribe;
  let locale;
  let dateFormatter;

  function updateDate(date, currentLocale) {
    if (locale !== currentLocale) {
      locale = currentLocale;
      dateFormatter = new Intl.DateTimeFormat(locale, { weekday: 'long', month: 'long', day: 'numeric' });
      agenda?.setLocale(locale);
    }
    const day = dateFormatter.format(date);
    if (dateLabel.textContent !== day) dateLabel.textContent = day;
    calendar.update(date, locale);
  }

  function showText(element, value) {
    const text = value || '';
    if (element.textContent !== text) element.textContent = text;
    element.hidden = !text;
  }

  function showMedia(state) {
    if (state.sessionId !== snapshot.sessionId || state.trackId !== snapshot.trackId) showText(feedback, '');
    snapshot = state;
    const ready = state.status === 'ready';
    const hasTrack = ready || state.status === 'stale';
    const hasArtwork = hasTrack && typeof state.artwork === 'string' && state.artwork.length <= 2_000_000 && artwork.test(state.artwork);
    if (hasArtwork) {
      if (cover.getAttribute('src') !== state.artwork) cover.src = state.artwork;
    } else cover.removeAttribute('src');
    cover.hidden = !hasArtwork;
    coverFallback.hidden = hasArtwork;
    showText(track, hasTrack ? state.title || t('Unknown track') : t(statusLabels[state.status] ?? 'Could not read Windows media'));
    const updated = lastReading(state.sampledAt);
    showText(playback, ready ? t(playbackLabels[state.playback]) : hasTrack ? [t('Cached'), updated].filter(Boolean).join(' · ') : '');
    showText(artist, hasTrack && state.artist);
    showText(album, hasTrack && state.album);
    showText(source, hasTrack && [state.source && sourceName(state.source), ready && updated].filter(Boolean).join(' · '));

    renderTimeline();
    renderTransport();
  }

  function sameTrack(target) {
    return target?.sessionId === snapshot.sessionId && target?.trackId === snapshot.trackId;
  }

  function seekBounds() {
    const { seekMinMs: min, seekMaxMs: max } = snapshot;
    if (snapshot.status !== 'ready' || !snapshot.sessionId || !snapshot.trackId
        || !Number.isSafeInteger(min) || !Number.isSafeInteger(max) || min < 0 || max <= min) return null;
    return { min, max };
  }

  function renderSeekPosition() {
    const value = Number(seek.value);
    const fill = (value - Number(seek.min)) / (Number(seek.max) - Number(seek.min));
    seek.style.setProperty('--seek-fill', `${fill * 100}%`);
    seek.setAttribute('aria-valuetext', `${time(value)} of ${time(snapshot.durationMs)}`);
    showText(elapsed, time(value));
  }

  function renderTimeline() {
    const current = snapshot.status === 'ready' ? position(snapshot, Date.now()) : null;
    timeline.hidden = !Number.isFinite(current) || !(snapshot.durationMs > 0);
    if (timeline.hidden) return;
    const bounds = seekBounds();
    seek.hidden = !bounds;
    progress.hidden = Boolean(bounds);
    showText(duration, time(snapshot.durationMs));
    if (!bounds) {
      progress.max = snapshot.durationMs;
      progress.value = current;
      showText(elapsed, time(current));
      return;
    }
    seek.disabled = pending || Boolean(seekGesture && !sameTrack(seekGesture.target));
    if (!seekGesture || seekGesture.cancelled || !sameTrack(seekGesture.target)) {
      seek.min = bounds.min;
      seek.max = bounds.max;
      seek.value = requestedSeek && sameTrack(requestedSeek.target) ? requestedSeek.positionMs : Math.round(current);
    }
    renderSeekPosition();
  }

  function commandFor(control) {
    if (snapshot.status !== 'ready' || !snapshot.sessionId) return null;
    if (control === 'previous') return snapshot.canPrevious ? 'previous' : null;
    if (control === 'next') return snapshot.canNext ? 'next' : null;
    const playing = snapshot.playback === 'playing';
    if (playing && snapshot.canPause) return 'pause';
    if (!playing && snapshot.canPlay) return 'play';
    return snapshot.canToggle ? 'toggle' : null;
  }

  function renderTransport() {
    const playing = snapshot.playback === 'playing';
    const caption = t(playing ? 'Pause' : 'Play');
    play.setAttribute('aria-label', caption);
    play.title = caption;
    playIcon.toggleAttribute('hidden', playing);
    pauseIcon.toggleAttribute('hidden', !playing);
    previous.disabled = pending || !commandFor('previous');
    play.disabled = pending || !commandFor('play');
    next.disabled = pending || !commandFor('next');
  }

  async function changePlayback(control, target = snapshot, positionMs) {
    const bounds = control === 'seek' ? seekBounds() : null;
    const command = control === 'seek' ? bounds && 'seek' : commandFor(control);
    if (!command || pending || panel.hidden || document.hidden) return;
    if (bounds && (!sameTrack(target) || !Number.isSafeInteger(positionMs) || positionMs < bounds.min || positionMs > bounds.max)) return;
    const version = viewVersion;
    const { sessionId, trackId } = target;
    const unavailable = t('Windows media controls did not respond.');
    pending = true;
    if (bounds) requestedSeek = { target, positionMs };
    showText(feedback, '');
    renderTransport();
    renderTimeline();
    try {
      const result = await api.changeNowPlaying({ command, sessionId, trackId, ...(bounds ? { positionMs } : {}) });
      if (result?.status === 'ok' && bounds && sameTrack(target)) {
        snapshot = { ...snapshot, positionMs, positionUpdatedAt: Number.isFinite(snapshot.rate) ? Date.now() : 0 };
      }
      if (version === viewVersion && result?.status !== 'ok') {
        showText(feedback, commandErrors[result?.status] ? t(commandErrors[result.status]) : unavailable);
      }
    } catch {
      if (version === viewVersion) showText(feedback, unavailable);
    } finally {
      pending = false;
      requestedSeek = undefined;
      renderTransport();
      renderTimeline();
    }
  }

  function stopMedia() {
    unsubscribe?.();
    unsubscribe = undefined;
    seekGesture = undefined;
  }

  function refreshMedia() {
    const visible = !panel.hidden && !document.hidden;
    pomodoro?.setVisible(visible);
    agenda?.setVisible(visible);
    if (!visible) stopMedia();
    else unsubscribe ??= media.subscribe(showMedia);
  }

  function setOpen(open) {
    if (panel.hidden === !open) return;
    viewVersion++;
    showText(feedback, '');
    window.LastraDeckViews.setPanel(panel, open);
    refreshMedia();
  }
  document.addEventListener('lastra-language', () => { if (!panel.hidden) showMedia(snapshot); });

  previous.addEventListener('click', () => void changePlayback('previous'));
  play.addEventListener('click', () => void changePlayback('play'));
  next.addEventListener('click', () => void changePlayback('next'));
  seek.addEventListener('pointerdown', (event) => {
    if (event.isPrimary && event.button === 0 && seekBounds()) seekGesture = { pointerId: event.pointerId, target: snapshot };
  });
  seek.addEventListener('input', renderSeekPosition);
  seek.addEventListener('change', () => {
    const gesture = seekGesture;
    seekGesture = undefined;
    if (gesture?.cancelled || (gesture && !sameTrack(gesture.target))) {
      renderTimeline();
      return;
    }
    void changePlayback('seek', gesture?.target ?? snapshot, Number(seek.value));
  });
  for (const eventName of ['pointerup', 'pointercancel']) {
    window.addEventListener(eventName, (event) => {
      const gesture = seekGesture;
      if (!gesture || gesture.pointerId !== event.pointerId) return;
      if (eventName === 'pointercancel') gesture.cancelled = true;
      // Let the range input commit its value before discarding the gesture target.
      setTimeout(() => {
        if (seekGesture !== gesture) return;
        seekGesture = undefined;
        renderTimeline();
      }, 0);
    });
  }

  api.onDashboardCalendar((label) => {
    calendarButton.hidden = !label;
    if (label) {
      calendarButton.title = `Open ${label}`;
      calendarButton.setAttribute('aria-label', calendarButton.title);
    }
    showText(calendarFeedback, '');
  });
  calendarButton.addEventListener('click', async () => {
    if (calendarButton.hidden || calendarButton.disabled) return;
    calendarButton.disabled = true;
    showText(calendarFeedback, '');
    try {
      await api.openDashboardCalendar();
    } catch {
      showText(calendarFeedback, window.LastraI18n.t('Could not open the calendar.'));
    } finally {
      calendarButton.disabled = false;
    }
  });
  panel.addEventListener('lastra:close-view', () => setOpen(false));
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !panel.hidden) setOpen(false);
  });
  document.addEventListener('visibilitychange', refreshMedia);
  window.addEventListener('pagehide', stopMedia);
  window.addEventListener('pagehide', () => pomodoro?.destroy());
  window.addEventListener('pagehide', () => agenda?.destroy());
  window.LastraDashboard = { setOpen, updateDate };
})();
