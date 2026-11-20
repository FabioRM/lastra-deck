'use strict';

{
  const CONTROL_FIELDS = ['action', 'hold', 'double', 'confirm', 'onBusy', 'repeatOnHold'];
  const MAX_CONTROLS = 128;

  function controlFields(source) {
    return Object.fromEntries(CONTROL_FIELDS.filter((key) => source?.[key] !== undefined).map((key) => [key, source[key]]));
  }

  function linkedControl(profile, key) {
    if (!key?.controlId) return undefined;
    return profile.controlBindings?.find(({ id }) => id === key.controlId);
  }

  function resolveLinkedKey(profile, key) {
    if (!key?.controlId) return key;
    const control = linkedControl(profile, key);
    return control ? { ...key, ...controlFields(control) } : { ...key, unavailable: 'The linked control is unavailable.' };
  }

  function controlFromKey(id, key) {
    return { id, label: key.label?.trim() || 'Linked control', ...structuredClone(controlFields(key)) };
  }

  function linkKey(key, controlId) {
    const placement = { ...key, controlId };
    for (const field of CONTROL_FIELDS) delete placement[field];
    return placement;
  }

  function detachKey(profile, key) {
    if (!key?.controlId) return key;
    const control = linkedControl(profile, key);
    if (!control) throw new Error('The linked control is unavailable.');
    const { controlId, ...placement } = key;
    return { ...placement, ...structuredClone(controlFields(control)) };
  }

  function clipboardControls(profile, kind, item) {
    if (kind === 'key') return detachKey(profile, item);
    if (kind === 'page' || kind === 'group') return { ...item, keys: item.keys.map((key) => detachKey(profile, key)) };
    return item;
  }

  function countPlacements(profile, controlId) {
    return [...profile.pages, profile.bar].reduce((total, page) => total + (page?.keys ?? [])
      .filter((key) => key?.controlId === controlId).length, 0);
  }

  function canRepeatTap({ action, hold, double, confirm, onBusy } = {}) {
    if (hold || double || confirm || onBusy === 'queue-one') return false;
    if (action?.type === 'media') return ['volup', 'voldown'].includes(action.key);
    if (action?.type !== 'hotkey' || typeof action.keys !== 'string') return false;
    const chord = action.keys.toLowerCase().replace(/\s+/g, '');
    return /^(left|right|up|down|pageup|pagedown)$/.test(chord)
      || /^(ctrl|control)\+(plus|equals|minus|add|subtract|char:plus|char:equals|=|\+)$/.test(chord);
  }

  function repeatsTap(behavior) {
    return canRepeatTap(behavior) && (behavior.repeatOnHold ?? (behavior.action.type === 'media'));
  }

  function sceneTarget(action) {
    if (action?.type !== 'obs-scene') return undefined;
    if (typeof action.scene !== 'string' || !/^\P{Cc}{1,200}$/u.test(action.scene) || !action.scene.trim() ||
        !['program', 'preview'].includes(action.bus ?? 'program')) throw new Error('Enter an OBS scene name and choose a scene bus.');
    return { scene: action.scene, bus: action.bus ?? 'program' };
  }

  function obsSceneState(view, { scene, bus }) {
    if (view?.status === 'syncing' || view?.status === 'connecting') {
      return { text: 'Checking…', pressed: null, unavailable: 'OBS is synchronizing.' };
    }
    if (view?.status !== 'connected') {
      return { text: 'Unavailable', pressed: null, unavailable: 'OBS is disconnected.' };
    }
    const preview = bus === 'preview';
    if (view.studio !== preview) return { text: 'Unavailable', pressed: null,
      unavailable: preview ? 'Enable OBS Studio Mode for the preview scene.' : 'Disable OBS Studio Mode for the program scene.' };
    if (!view.scenes?.includes(scene)) return { text: 'Unavailable', pressed: null, unavailable: 'The OBS scene is unavailable.' };
    if (typeof view[bus] !== 'string') return { text: 'Checking…', pressed: null, unavailable: 'The current OBS scene is unavailable.' };
    const pressed = view[bus] === scene;
    return { text: pressed ? (preview ? 'In preview' : 'On program') : 'Ready', pressed };
  }

  const api = { CONTROL_FIELDS, MAX_CONTROLS, controlFields, linkedControl, resolveLinkedKey, controlFromKey, linkKey, detachKey,
    clipboardControls, countPlacements, canRepeatTap, repeatsTap, sceneTarget, obsSceneState };
  if (typeof module === 'object') module.exports = api;
  else window.LastraLinkedControls = api;
}
