'use strict';

{
  const actionLabels = {
    sequence: 'Macro', repeat: 'Repeat', if: 'Check condition', choose: 'Wait for choice', random: 'Random pick', delay: 'Delay',
    'wait-for': 'Wait for state', 'obs-scene': 'Set OBS scene', 'spotify-playback': 'Spotify playback',
    launch: 'Launch app', open: 'Open resource', hotkey: 'Send shortcut', media: 'Media key', audio: 'Change audio',
    text: 'Type text', workspace: 'Restore workspace', timer: 'Timer', sound: 'Play sound',
  };

  function flowFeedback(progress) {
    if (!progress) return { label: '', badge: '', detail: '' };
    const { type, path, step, total, iteration, iterations, attempt, attempts, stopping } = progress;
    const badge = iteration ? `${iteration}/${iterations}` : step ? `${step}/${total}` : '';
    const parts = [
      stopping && 'Stopping', iteration && `Iteration ${iteration} of ${iterations}`,
      step && `Step ${step} of ${total}`, actionLabels[type] ?? 'Run action',
      attempts > 1 && `Attempt ${attempt} of ${attempts}`,
    ];
    const detail = stopping ? 'Any operation already underway can finish. Lastra will skip the remaining steps.'
      : path?.length > 1 ? path.map((segment) => typeof segment === 'number' ? `Step ${segment}` : segment).join(' › ') : '';
    return { label: parts.filter(Boolean).join(' · '), badge, detail };
  }

  if (typeof module === 'object') module.exports = { flowFeedback };
  else window.LastraFlowFeedback = { flowFeedback };
}
