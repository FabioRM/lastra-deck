// @ts-check
'use strict';

const LIMIT = 100;
const STEP_LIMIT = 100;
const SENSITIVE_LABELS = [
  /\b[a-z][a-z0-9+.-]*:\/\/|\b(?:https?:|www\.)\S/i,
  /\b[A-Z]:[\\/]|\\\\/i,
  /\b(?:ctrl|control|shift|alt|win)\s*\+/i,
  /\b(?:password|secret|token|api[-_ ]?key|authorization)\s*[:=]\s*\S/i,
];

function displayLabel(value, fallback) {
  const label = typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f]/g, ' ').trim() : '';
  return label && !SENSITIVE_LABELS.some((pattern) => pattern.test(label)) ? label.slice(0, 80) : fallback;
}

function stepResults(result) {
  if (!result?.steps?.length) return {};
  const steps = result.steps.slice(0, STEP_LIMIT).map((step) => ({
    path: step.path, type: step.type, status: step.status, attempts: step.attempts.length,
  }));
  return { steps, stepCount: result.steps.length };
}

class ActionHistory {
  #entries = [];

  /** @param {{ now?: () => number, onRecord?: (entry: Record<string, any>, activity: any) => void }} [options] */
  constructor({ now = Date.now, onRecord = () => {} } = {}) {
    this.now = now;
    this.onRecord = onRecord;
  }

  async run({ label, origin, context, gesture, at = this.now(), activity }, execute) {
    let result;
    try {
      result = await execute();
      return result;
    } finally {
      const entry = {
        label: displayLabel(label, origin === 'deck' ? 'Deck key' : 'App command'),
        origin,
        context: displayLabel(context, ''),
        gesture: origin === 'deck' ? gesture : undefined,
        at,
        outcome: result?.ok === true ? 'succeeded' : result?.cancelled ? 'cancelled' : 'failed',
        ...(origin === 'deck' ? stepResults(result) : {}),
      };
      this.#entries.unshift(entry);
      this.#entries.sort((a, b) => b.at - a.at);
      this.#entries.length = Math.min(this.#entries.length, LIMIT);
      this.onRecord(entry, activity);
    }
  }

  snapshot() {
    return { entries: structuredClone(this.#entries) };
  }
}

/** @param {{ owner: string, status: string, updatedAt: number, activity?: string }} entry */
function recordAgentReview(history, entry, label, target, ok = entry.status === 'confirmed') {
  const { owner, status, updatedAt, activity } = entry;
  const context = owner.slice(0, 8) + ' · ' + target;
  const cancelled = ['cancelled', 'declined', 'expired'].includes(status);
  void history.run({ origin: 'agent', label, context, at: updatedAt, activity },
    async () => cancelled ? { ok, cancelled } : { ok }).catch(() => {});
}

module.exports = { ActionHistory, stepResults, STEP_LIMIT, recordAgentReview };
