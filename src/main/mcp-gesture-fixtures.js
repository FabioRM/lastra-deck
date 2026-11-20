// @ts-check
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { createHash, randomBytes } = require('node:crypto');
const { DraftRequestError } = require('./mcp-drafts');
const { ID: CLIENT_ID } = require('./mcp-link');
const { scenarioInput, simulateGesture } = require('./mcp-simulate');
const { traceInput, traceOutput, traceOf, traceReplay } = require('./mcp-gesture-trace');
const { conditionFields, WAIT_CONDITIONS } = require('../shared/action-flow');
const { layouts } = require('./actions/keyboard-samples');
const { writeAtomic } = require('./write-atomic');

const VERSION = 1;
const LIMIT = 64;
const PER_ACTIVITY_LIMIT = 16;
const MAX_FILE_BYTES = 512 * 1024;
const MAX_SCENARIO_BYTES = 16 * 1024;
const ID = /^[a-f0-9]{24}$/;
const DATA_ID = /^[a-z0-9_-]{1,40}$/i;
const CHECKSUM = /^[a-f0-9]{64}$/;
const STATUS = ['success', 'failed', 'unavailable', 'cancelled', 'confirmation-required'];
const STEP_STATUS = ['succeeded', 'warning', 'failed', 'skipped'];
const EFFECTS = ['launch', 'open', 'workspace', 'obs-scene', 'chord', 'text', 'audio', 'spotify-playback', 'timer', 'sound'];
const PROVIDERS = ['audio', 'spotify', 'obs'];
const MAX_REPORT_ROWS = 64;

const text = { type: 'string' };
const integer = { type: 'integer' };
const milliseconds = { type: 'number', minimum: 0 };
const id = { ...text, pattern: ID.source };
const bool = { type: 'boolean' };
const object = (properties, required = []) => ({ type: 'object', additionalProperties: false, properties, required });
const list = (items, maxItems) => ({ type: 'array', items, maxItems });
const definitions = {
  list: [], inspect: ['fixture'], record: ['label', 'scenario', 'draft', 'revision'],
  run: ['fixture', 'draft', 'revision'], replay: ['trace', 'scenario', 'draft', 'revision'], remove: ['fixture'],
};
const { profile: _profile, ...scenarioProperties } = scenarioInput.properties;
const scenarioSchema = object(scenarioProperties, ['key']);
const fixtureInput = object({ command: { enum: Object.keys(definitions) }, fixture: id, draft: id,
  revision: { ...integer, minimum: 1 }, label: { ...text, minLength: 1, maxLength: 60 }, scenario: scenarioSchema, trace: traceInput }, ['command']);
const baselineSchema = object({ status: { enum: STATUS }, elapsedMs: milliseconds, effectCount: integer, stepCount: integer,
  fingerprint: { ...text, pattern: CHECKSUM.source } }, ['status', 'elapsedMs', 'effectCount', 'stepCount', 'fingerprint']);
const metadataSchema = object({ id, label: text, createdAt: integer, key: text, page: text,
  gesture: scenarioSchema.properties.gesture }, ['id', 'label', 'createdAt', 'key', 'gesture']);
const effectSchema = object({ atMs: milliseconds, type: { enum: EFFECTS }, device: { enum: ['output', 'microphone'] },
  bus: { enum: ['program', 'preview'] }, target: { enum: ['path', 'URL or protocol'] }, characters: integer }, ['atMs', 'type']);
const stepState = { enum: STEP_STATUS };
const stepSchema = object({ path: list({ anyOf: [{ ...integer, minimum: 1, maximum: 20 }, { enum: ['then', 'else'] }] }, 3),
  type: text, status: stepState, attempts: list(stepState, 3) }, ['path', 'type', 'status', 'attempts']);
const fixtureOutput = object({ version: { const: VERSION }, fixtures: list(metadataSchema, PER_ACTIVITY_LIMIT),
  fixture: metadataSchema, scenario: scenarioSchema, expected: baselineSchema, observed: baselineSchema, matches: bool, removed: bool,
  effects: list(effectSchema, MAX_REPORT_ROWS), steps: list(stepSchema, MAX_REPORT_ROWS), truncated: bool, replay: traceOutput }, ['version']);

const record = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const matches = (raw, pattern) => typeof raw === 'string' && pattern.test(raw);
const whole = (raw, min, max = Number.MAX_SAFE_INTEGER) => Number.isSafeInteger(raw) && raw >= min && raw <= max;
const flag = (raw) => typeof raw === 'boolean';

function validFields(raw, fields) {
  return record(raw) && Object.keys(raw).every((name) => fields.includes(name));
}

function fixtureName(value) {
  if (typeof value !== 'string' || !/^\P{Cc}{1,60}$/u.test(value.trim())) throw new DraftRequestError('Enter a fixture name of 1 to 60 characters.');
  return value.trim();
}

function fixtureValues(raw) {
  if (!validFields(raw, Object.keys(WAIT_CONDITIONS))) throw new DraftRequestError('Choose supported simulated provider states.');
  return Object.fromEntries(Object.entries(raw).map(([key, value]) => {
    if (value === null || value === '') return [key, null];
    try { return [key, conditionFields({ condition: key, expected: value }).expected]; }
    catch (error) { throw new DraftRequestError(error.message); }
  }));
}

function sampleOf(raw, event) {
  const allowNullApp = event && raw.appId === null;
  const allowedLayout = raw.keyboardLayout === undefined || (typeof raw.keyboardLayout === 'string' && Object.hasOwn(layouts, raw.keyboardLayout));
  const allowedTitle = raw.windowTitle == null || (typeof raw.windowTitle === 'string' && /^\P{Cc}{0,512}$/u.test(raw.windowTitle));
  const allowedApp = raw.appId === undefined || allowNullApp || matches(raw.appId, /^[a-z0-9][a-z0-9._!{}-]{0,190}$/i);
  const allowedProviders = raw.disconnected === undefined || (Array.isArray(raw.disconnected) && raw.disconnected.length <= 3
    && new Set(raw.disconnected).size === raw.disconnected.length && raw.disconnected.every((name) => PROVIDERS.includes(name)));
  if (!allowedLayout || !allowedTitle || !allowedApp || !allowedProviders || (raw.windowId !== undefined && !whole(raw.windowId, 1))
      || (raw.photoshopWorkspace !== undefined && !flag(raw.photoshopWorkspace))) {
    throw new DraftRequestError('Choose a fixture window, layout and provider sample.');
  }
  const { windowId, appId, windowTitle, keyboardLayout, photoshopWorkspace, disconnected, values } = raw;
  return Object.fromEntries(Object.entries({ windowId, appId, windowTitle, keyboardLayout, photoshopWorkspace,
    disconnected: disconnected?.slice(), values: values === undefined ? undefined : fixtureValues(values) }).filter(([, value]) => value !== undefined));
}

function scenarioOf(raw) {
  if (!validFields(raw, Object.keys(scenarioProperties)) || !matches(raw.key, DATA_ID) ||
      (raw.page !== undefined && raw.page !== 'bar:' && !matches(raw.page, DATA_ID)) ||
      (raw.gesture !== undefined && !scenarioProperties.gesture.enum.includes(raw.gesture)) ||
      (raw.confirmed !== undefined && !flag(raw.confirmed)) || (raw.requireStableWindow !== undefined && !flag(raw.requireStableWindow)) ||
      (raw.seed !== undefined && !whole(raw.seed, 0, 0xFFFF_FFFF))) {
    throw new DraftRequestError('Choose a fixture key, gesture and supported sample settings.');
  }
  const { key, page, confirmed, requireStableWindow, gesture = 'tap', timeline, answers, seed } = raw;
  /** @type {Record<string, any>} */
  const scenario = { key, ...(page !== undefined ? { page } : {}), gesture, ...(confirmed !== undefined ? { confirmed } : {}),
    ...(requireStableWindow !== undefined ? { requireStableWindow } : {}), ...(seed !== undefined ? { seed } : {}), ...sampleOf(raw, false) };
  if (answers !== undefined) {
    if (!record(answers) || Object.keys(answers).length > scenarioProperties.answers.maxProperties
        || Object.entries(answers).some(([prompt, choice]) => !matches(prompt, DATA_ID) || !matches(choice, DATA_ID))) {
      throw new DraftRequestError('Choose valid fixture prompt and answer IDs.');
    }
    scenario.answers = { ...answers };
  }
  if (timeline !== undefined) {
    if (!Array.isArray(timeline) || timeline.length > 32) throw new DraftRequestError('A fixture accepts up to 32 timeline events.');
    let previous = 0;
    scenario.timeline = timeline.map((entry) => {
      if (!validFields(entry, Object.keys(scenarioProperties.timeline.items.properties)) || !whole(entry.atMs, previous, 600_000)
          || (entry.cancel !== undefined && !flag(entry.cancel))) throw new DraftRequestError('Fixture events must be ordered and use supported settings.');
      previous = entry.atMs;
      return { atMs: entry.atMs, ...(entry.cancel !== undefined ? { cancel: entry.cancel } : {}), ...sampleOf(entry, true) };
    });
  }
  if (Buffer.byteLength(JSON.stringify(scenario)) > MAX_SCENARIO_BYTES) throw new DraftRequestError('The gesture fixture is too large.');
  return scenario;
}

function fixtureParams(raw) {
  if (!record(raw) || typeof raw.command !== 'string' || !Object.hasOwn(definitions, raw.command)) throw new DraftRequestError('Choose a gesture fixture command.');
  const fields = definitions[raw.command];
  if (!validFields(raw, ['command', ...fields]) || !fields.every((field) => Object.hasOwn(raw, field))) {
    throw new DraftRequestError('Supply the fields required by the gesture fixture command.');
  }
  const { command, fixture, draft, revision } = raw;
  if (fields.includes('fixture') && !matches(fixture, ID)) throw new DraftRequestError('Choose a fixture ID.');
  if (fields.includes('draft') && (!matches(draft, ID) || !whole(revision, 1))) throw new DraftRequestError('Choose a draft and its current revision.');
  if (command === 'replay') {
    const scenario = scenarioOf(raw.scenario);
    if (!Object.hasOwn(raw.scenario, 'gesture') || scenario.page === undefined) {
      throw new DraftRequestError('Choose the observed contact’s draft page and gesture explicitly.');
    }
    return { command, draft, revision, scenario, trace: traceOf(raw.trace) };
  }
  return { command, fixture, draft, revision, ...(command === 'record' ? { label: fixtureName(raw.label), scenario: scenarioOf(raw.scenario) } : {}) };
}

function redact(result) {
  const effects = result.effects.flatMap(({ atMs, type, device, bus, characters, target }) => {
    if (!EFFECTS.includes(type)) return [];
    return [{ atMs, type, ...(['output', 'microphone'].includes(device) ? { device } : {}),
      ...(['program', 'preview'].includes(bus) ? { bus } : {}), ...(whole(characters, 0) ? { characters } : {}),
      ...(['path', 'URL or protocol'].includes(target) ? { target } : {}) }];
  });
  const steps = (result.steps ?? []).flatMap(({ path, type, status, attempts }) => STEP_STATUS.includes(status) ? [{
    path: path.filter((part) => whole(part, 1, 20) || part === 'then' || part === 'else'), type, status,
    attempts: attempts.map(({ status }) => status).filter((value) => STEP_STATUS.includes(value)),
  }] : []);
  const { elapsedMs } = result;
  const fingerprint = createHash('sha256').update(JSON.stringify({ status: result.status, elapsedMs, effects, steps })).digest('hex');
  const baseline = { status: result.status, elapsedMs, effectCount: effects.length, stepCount: steps.length, fingerprint };
  return { baseline, effects: effects.slice(0, MAX_REPORT_ROWS), steps: steps.slice(0, MAX_REPORT_ROWS),
    truncated: effects.length > MAX_REPORT_ROWS || steps.length > MAX_REPORT_ROWS };
}

function metadata(entry) {
  const { id, label, createdAt, scenario: { key, page, gesture } } = entry;
  return { id, label, createdAt, key, ...(page !== undefined ? { page } : {}), gesture };
}

function restoreEntry(entry) {
  if (!validFields(entry, ['id', 'owner', 'activity', 'label', 'createdAt', 'scenario', 'expected']) ||
      !matches(entry.id, ID) || !matches(entry.owner, CLIENT_ID) || !matches(entry.activity, DATA_ID) || !whole(entry.createdAt, 0)) {
    throw new Error('Invalid saved fixture.');
  }
  const { status, elapsedMs, effectCount, stepCount, fingerprint } = entry.expected ?? {};
  if (!validFields(entry.expected, Object.keys(baselineSchema.properties)) || !STATUS.includes(status) || !Number.isFinite(elapsedMs) || elapsedMs < 0
      || !whole(effectCount, 0) || !whole(stepCount, 0) || !matches(fingerprint, CHECKSUM)) throw new Error('Invalid saved fixture baseline.');
  return { id: entry.id, owner: entry.owner, activity: entry.activity, label: fixtureName(entry.label), createdAt: entry.createdAt,
    scenario: scenarioOf(entry.scenario), expected: { status, elapsedMs, effectCount, stepCount, fingerprint } };
}

class AgentGestureFixtures {
  /**
   * @param {{ file: string, drafts: any, log?: (message: string) => void, simulate?: typeof simulateGesture, now?: () => number }} options
   */
  constructor({ file, drafts, log = () => {}, simulate = simulateGesture, now = Date.now }) {
    this.file = file;
    this.drafts = drafts;
    this.log = log;
    this.simulate = simulate;
    this.now = now;
    this.entries = [];
    try {
      const info = fs.statSync(file);
      if (!info.isFile() || info.size > MAX_FILE_BYTES) throw new Error('Invalid saved fixture file.');
      const stored = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (stored?.version !== VERSION || !Array.isArray(stored.entries) || stored.entries.length > LIMIT) throw new Error('Invalid saved fixture collection.');
      const entries = stored.entries.map(restoreEntry);
      if (new Set(entries.map(({ id }) => id)).size !== entries.length) throw new Error('Duplicate saved fixture ID.');
      const counts = new Map();
      for (const { owner, activity } of entries) {
        const key = `${owner}/${activity}`;
        const count = (counts.get(key) ?? 0) + 1;
        if (count > PER_ACTIVITY_LIMIT) throw new Error('Too many saved fixtures for an activity.');
        counts.set(key, count);
      }
      this.entries = entries;
    } catch (error) {
      if (error.code === 'ENOENT') return;
      this.unavailable = true;
      log('The saved agent regression fixtures could not be opened.');
    }
  }

  save(entries) {
    const text = JSON.stringify({ version: VERSION, entries }) + '\n';
    if (Buffer.byteLength(text) > MAX_FILE_BYTES) throw new DraftRequestError('Remove an unused fixture to free storage.');
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      writeAtomic(this.file, text);
    } catch {
      this.log('The saved agent regression fixtures could not be updated.');
      throw new DraftRequestError('Lastra could not save the fixture collection.');
    }
    this.entries = entries;
  }

  owned(owner, activity) {
    return this.entries.filter((entry) => entry.owner === owner && entry.activity === activity);
  }

  prune(owners) {
    if (this.unavailable) return;
    const remaining = this.entries.filter(({ owner }) => owners.has(owner));
    if (remaining.length !== this.entries.length) {
      try { this.save(remaining); } catch { /* The revoked client already lost access. */ }
    }
  }

  async change(owner, activity, params, authorized) {
    const check = () => {
      if (!authorized()) throw new DraftRequestError('The agent grant or activity changed.');
    };
    check();
    const { command, draft, revision } = params;
    const replay = command === 'replay';
    if (this.unavailable && !replay) throw new DraftRequestError('The saved gesture fixture collection is unavailable.');
    const base = { version: VERSION };
    const entries = replay ? [] : this.owned(owner, activity);
    if (command === 'list') return { ...base, fixtures: entries.map(metadata) };
    const existing = entries.find(({ id }) => id === params.fixture);
    if (!replay && command !== 'record' && !existing) throw new DraftRequestError('The gesture fixture is unavailable.');
    if (command === 'inspect') return { ...base, fixture: metadata(existing), scenario: structuredClone(existing.scenario), expected: { ...existing.expected } };
    if (command === 'remove') {
      this.save(this.entries.filter((item) => item !== existing));
      return { ...base, fixture: metadata(existing), removed: true };
    }

    const source = this.drafts.resolve(owner, activity, draft, revision);
    const scenario = existing?.scenario ?? params.scenario;
    let result;
    try { result = redact(await this.simulate({ ...scenario, profile: source.profile })); }
    catch { throw new DraftRequestError('The gesture fixture could not be simulated against this draft.'); }
    check();
    this.drafts.resolve(owner, activity, draft, revision);
    const { baseline, ...details } = result;
    if (replay) return { ...base, replay: traceReplay(params.trace, baseline.status), observed: baseline, ...details };
    if (existing) {
      if (!this.entries.includes(existing)) throw new DraftRequestError('The gesture fixture was removed during the run.');
      return { ...base, fixture: metadata(existing), expected: { ...existing.expected }, observed: baseline,
        matches: existing.expected.fingerprint === baseline.fingerprint, ...details };
    }
    if (this.entries.length >= LIMIT || this.owned(owner, activity).length >= PER_ACTIVITY_LIMIT) {
      throw new DraftRequestError('Remove an unused gesture fixture before recording another.');
    }
    const entry = { id: randomBytes(12).toString('hex'), owner, activity, label: params.label,
      createdAt: this.now(), scenario: structuredClone(scenario), expected: baseline };
    this.save([...this.entries, entry]);
    return { ...base, fixture: metadata(entry), expected: { ...baseline }, ...details };
  }
}

module.exports = { AgentGestureFixtures, fixtureInput, fixtureOutput, fixtureParams };
