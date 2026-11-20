// @ts-check
'use strict';

const OUTPUT_TIMING_REFRESH_MS = 4_000;
const requests = { recording: 'GetRecordStatus', streaming: 'GetStreamStatus' };

function readOutputTiming(output, raw, sampledAt) {
  if (typeof raw?.outputActive !== 'boolean' || (output === 'recording' && typeof raw.outputPaused !== 'boolean')
      || (raw.outputReconnecting !== undefined && typeof raw.outputReconnecting !== 'boolean')) return null;
  const state = !raw.outputActive ? 'idle' : raw.outputReconnecting ? 'reconnecting'
    : output === 'recording' && raw.outputPaused === true ? 'paused' : 'active';
  const durationMs = Number.isSafeInteger(raw.outputDuration) && raw.outputDuration >= 0 ? raw.outputDuration : null;
  return { state, durationMs: state === 'idle' ? null : durationMs, sampledAt };
}

class ObsOutputTiming {
  constructor({ now = () => performance.now() } = {}) {
    this.now = now;
    this.samples = { recording: null, streaming: null };
    this.epoch = 0;
    this.lastRefresh = -Infinity;
  }

  sample(output, raw) {
    return readOutputTiming(output, raw, this.now());
  }

  seed(samples) {
    for (const output of Object.keys(requests)) {
      const sample = samples[output];
      if (sample && (!this.samples[output] || sample.sampledAt >= this.samples[output].sampledAt)) this.samples[output] = sample;
    }
  }

  invalidate(output) {
    this.epoch++;
    this.lastRefresh = -Infinity;
    if (output) this.samples[output] = null;
    else this.samples = { recording: null, streaming: null };
  }

  snapshot() {
    const now = this.now();
    const project = (sample) => sample ? { state: sample.state, durationMs: sample.durationMs,
      ageMs: Math.max(0, Math.round(now - sample.sampledAt)) } : null;
    return { recording: project(this.samples.recording), streaming: project(this.samples.streaming) };
  }

  async read(request, isCurrent, active) {
    if (!isCurrent()) return null;
    const now = this.now();
    const stale = Object.keys(requests).filter((output) => active[output] &&
      (!this.samples[output] || now - this.samples[output].sampledAt >= OUTPUT_TIMING_REFRESH_MS));
    if (stale.length && !this.pending && now - this.lastRefresh >= OUTPUT_TIMING_REFRESH_MS) {
      this.lastRefresh = now;
      const epoch = this.epoch;
      this.pending = Promise.all(stale.map(async (output) => {
        try { return [output, this.sample(output, await request(requests[output]))]; }
        catch { return [output, null]; }
      })).then((samples) => {
        if (isCurrent() && epoch === this.epoch) this.seed(Object.fromEntries(samples));
      }).finally(() => { this.pending = null; });
    }
    if (this.pending) await this.pending;
    return isCurrent() ? this.snapshot() : null;
  }
}

module.exports = { ObsOutputTiming, readOutputTiming, OUTPUT_TIMING_REFRESH_MS };
