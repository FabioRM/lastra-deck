'use strict';

{
  const { resolveKeyReadout } = typeof module === 'object' ? require('./key-readouts') : window.LastraKeyReadouts;
  const { FIXED_EDITING_KEYS, duplicateEditingKey } = typeof module === 'object' ? require('./editing-keys') : window.LastraEditingKeys;
  const { sceneTarget, repeatsTap } = typeof module === 'object' ? require('./linked-controls') : window.LastraLinkedControls;
  const { compositionIcons } = typeof module === 'object' ? require('./widget-composition') : window.LastraWidgetComposition;
  const { createProfileKeys } = typeof module === 'object' ? require('./profile-keys') : window.LastraProfileKeys;
  const PREVIEW_EDITING_KEYS = FIXED_EDITING_KEYS.map((key) => ({ ...key, category: 'system', unavailable: 'Preview only.' }));
  const liveIcons = {
    output: { on: 'volume-x', off: 'volume-2' },
    microphone: { on: 'mic-off', off: 'mic', mixed: 'mic' },
    spotify: { on: 'circle-pause', off: 'circle-play' },
  };

  function liveIconNames(key) {
    const source = key.action?.type === 'spotify-playback' ? 'spotify' : key.action?.type === 'audio' ? key.action.device : null;
    const icons = liveIcons[source];
    return icons && !key.image && (!key.icon || Object.values(icons).includes(key.icon)) ? icons : {};
  }

  function confirmationMode(value) {
    return value === true ? 'hold' : value?.mode;
  }

  function browserHistoryChord(key) {
    if (key?.action?.type !== 'hotkey' || typeof key.action.keys !== 'string' || key.hold || key.double || key.confirm) return undefined;
    const chord = key.action.keys.toLowerCase().replace(/\s/g, '');
    return chord === 'alt+left' || chord === 'alt+right' ? chord : undefined;
  }

  // The display receives gesture hints and visual assets. Commands stay with the profile.
  function toView(profile, { icon = () => null, image = () => null, unavailable = () => undefined,
    page = profile.pages[0], editingKeys = PREVIEW_EDITING_KEYS, foregroundExecutable = undefined, deduplicateEditing = true } = {}) {
    const grid = page.grid ?? profile.grid;
    const shortcutPack = Boolean(page.generated && page.pack);
    const resolver = createProfileKeys(profile);
    function effectiveKey(placement, owningPage) {
      try { return resolver.resolve(placement, owningPage); }
      catch (error) { return { ...placement, unavailable: error.message }; }
    }
    function surfaceKey(key, prefix = '') {
      if (!key) return null;
      const stateIcons = Object.fromEntries(Object.entries(liveIconNames(key)).flatMap(([state, name]) => {
        const svg = icon(name);
        return svg ? [[state, svg]] : [];
      }));
      const audio = key.action?.type === 'audio' ? key.action.device : null;
      let scene;
      try { scene = sceneTarget(key.action); } catch { /* An editor draft may not name a scene yet. */ }
      const timer = key.action?.type === 'timer' ? key.action : undefined;
      const sound = key.action?.type === 'sound' && (key.action.command ?? 'play') === 'play' ? key.action : undefined;
      const liveSource = scene ? 'obs-scene' : key.action?.type === 'spotify-playback' ? 'spotify' : timer ? 'timer' : sound ? 'sound' : undefined;
      const readout = resolveKeyReadout(key.readout, liveSource ?? audio);
      const reason = key.unavailable ?? unavailable(key);
      const shortcut = key.shortcut ?? (page.pack && !prefix && key.action?.type === 'hotkey' ? key.action.keys : undefined);
      return {
        id: prefix + key.id,
        label: key.label ?? key.id,
        category: key.category ?? 'app',
        icon: key.image ? null : icon(key.icon),
        image: key.image ? image(key.image) : null,
        hasHold: Boolean(key.hold),
        hasDouble: Boolean(key.double),
        hasRelease: Boolean(key.release),
        ...(repeatsTap(key) ? { repeatOnHold: true } : {}),
        confirm: confirmationMode(key.confirm) ?? null,
        confirmMs: key.confirm?.holdMs,
        onBusy: key.onBusy ?? 'ignore',
        ...(shortcut ? { shortcut } : {}),
        ...(reason ? { unavailable: reason } : {}),
        ...(key.span ? { span: key.span } : {}),
        ...(shortcutPack && !prefix && key.shortcutPage ? { shortcutPage: key.shortcutPage } : {}),
        audio,
        ...(key.controlId ? { controlId: key.controlId } : {}),
        ...(liveSource ? { liveSource } : {}),
        ...(scene ? { sceneTarget: scene } : {}),
        ...(timer ? { timer: { id: timer.id, kind: timer.kind ?? 'countdown', durationMs: timer.durationMs } } : {}),
        ...(sound ? { sound: { id: sound.id } } : {}),
        ...(Object.keys(stateIcons).length ? { stateIcons } : {}),
        ...(readout ? { readout } : {}),
      };
    }
    const barKeys = (profile.bar?.keys ?? []).map((key) => effectiveKey(key));
    const barSlots = barKeys.map((key) => surfaceKey(key, 'bar:'));
    const barHistory = shortcutPack && page.pack === 'chrome' ? new Set(barKeys.map((key, index) => {
      const targets = key?.action?.targetApps;
      const guard = key?.action?.shortcutGuard;
      if (!barSlots[index]?.unavailable && (!targets?.length || targets.some((app) => app.trim().toLowerCase() === 'chrome.exe'))
          && (!guard || guard.pack === 'chrome')) return browserHistoryChord(key);
      return undefined;
    }).filter(Boolean)) : null;
    const slotCount = shortcutPack ? page.keys.length : grid.cols * grid.rows;
    const slots = Array.from({ length: slotCount }, (_, index) => {
      const key = effectiveKey(page.keys[index], page);
      return barHistory?.has(browserHistoryChord(key))
        || (deduplicateEditing && duplicateEditingKey(key, editingKeys, { generated: page.generated, executable: foregroundExecutable }))
        ? null : surfaceKey(key);
    });
    const surfaceWidget = (widget) => widget.type === 'composition' ? { ...widget,
      icons: Object.fromEntries(compositionIcons(widget.settings.composition).map((name) => [name, icon(name)])) } : widget;
    return {
      name: profile.name, locale: profile.locale, grid, gestures: profile.gestures,
      ...(shortcutPack ? { shortcutPack } : {}),
      ...(page.shortcutPages ? { shortcutPages: page.shortcutPages } : {}),
      slots, editingKeys: editingKeys.map((key) => surfaceKey(key)), widgets: (page.widgets ?? []).map(surfaceWidget), bar: {
        keys: barSlots,
        widgets: (profile.bar?.widgets ?? []).map(surfaceWidget),
      },
    };
  }

  if (typeof module === 'object') module.exports = { toView, confirmationMode, liveIconNames };
  else window.LastraDeckView = { toView, liveIconNames };
}
