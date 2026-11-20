// @ts-check
'use strict';

const { EventEmitter } = require('node:events');
const fs = require('node:fs');
const path = require('node:path');
const { ObsSocket } = require('./obs-socket');
const { confirmState } = require('./confirm-state');
const { watchMonitorConfig } = require('./monitoring-config');
const { ObsOutputTiming } = require('./obs-output-timing');
const { openSecret, sealSecret } = require('./sealed-secret');
const { writeJsonSettings } = require('./json-settings-file');

const UPDATE_EVENTS = new Set([
  'CurrentSceneCollectionChanged', 'SceneListChanged', 'SceneCreated', 'SceneRemoved', 'SceneNameChanged',
  'CurrentProgramSceneChanged', 'CurrentPreviewSceneChanged', 'SceneTransitionEnded', 'StudioModeStateChanged',
  'SceneItemCreated', 'SceneItemRemoved', 'SceneItemListReindexed', 'SceneItemEnableStateChanged',
  'InputNameChanged', 'SourceFilterListReindexed', 'SourceFilterCreated', 'SourceFilterRemoved',
  'SourceFilterNameChanged', 'SourceFilterEnableStateChanged',
]);
const OUTPUT_EVENTS = { RecordStateChanged: 'recording', StreamStateChanged: 'streaming', ReplayBufferStateChanged: 'replay' };
const UPDATE_DELAY = 100;
const MAX_PREVIEW_IMAGE = 192 * 1024;
const PREVIEW_PREFIX = 'data:image/jpeg;base64,';
const PREVIEW_HEADER = /^data:image\/jpe?g;base64,/;
const RETRYABLE = new Set(['disabled', 'invalid', 'disconnected', 'authentication', 'unsupported', 'revoked']);
const notAvailable = () => { throw new Error('This OBS control or target is no longer available'); };
const createSocket = (config) => new ObsSocket(config);
const makeClient = (config, create = createSocket) => config.status === 'connecting' ? create(config) : null;

function loadObsConfig(file, env = process.env) {
  try {
    const settings = fs.statSync(file);
    if (!settings.isFile() || settings.size > 64 * 1024) return { status: 'invalid' };
    const raw = JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { status: 'invalid' };
    if (raw.enabled === false) return { status: 'disabled' };
    const port = raw.port ?? 4455;
    const password = env.LASTRA_OBS_PASSWORD ?? openSecret(raw, 'password') ?? '';
    if (!Number.isInteger(port) || port < 1 || port > 65535 || typeof password !== 'string') {
      return { status: 'invalid' };
    }
    sealSecret(file, raw, 'password');
    return { status: 'connecting', port, password };
  } catch (err) {
    return { status: err.code === 'ENOENT' ? 'disabled' : 'invalid' };
  }
}

function array(items) {
  return Array.isArray(items) ? items : [];
}

function numberOrNull(value) {
  return Number.isFinite(value) ? value : null;
}

function sourceView(rawItems) {
  return array(rawItems).filter((item) => typeof item?.sourceName === 'string' && Number.isInteger(item.sceneItemId))
    .map(({ sceneItemId, sourceName, sceneItemEnabled }) => ({
      id: sceneItemId, name: sourceName, visible: sceneItemEnabled === true,
    })).reverse();
}

const emptyView = (status) => ({
  status, canReconnect: RETRYABLE.has(status), studio: false, program: null, preview: null, recording: null, streaming: null, replay: null,
  scenes: [], sourceScene: null, items: [], detail: null,
});

function readRecording(data) {
  if (typeof data.outputActive !== 'boolean' || typeof data.outputPaused !== 'boolean') {
    throw new Error('OBS recording status is missing');
  }
  return { active: data.outputActive, paused: data.outputPaused, phase: null };
}

function readStream(data) {
  if (typeof data.outputActive !== 'boolean') throw new Error('OBS streaming status is missing');
  return { active: data.outputActive, phase: data.outputReconnecting ? 'reconnecting' : null };
}

function screenshotTarget(view) {
  if (view.status !== 'connected') return null;
  const preview = view.studio && view.preview;
  const scene = preview || view.program;
  if (typeof scene !== 'string' || !scene || scene.length > 512) return null;
  return { scene, bus: preview ? 'Preview' : 'Program' };
}

function boundedJpeg(body) {
  const bytes = Buffer.from(body, 'base64');
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes.at(-2) !== 0xff || bytes.at(-1) !== 0xd9) return false;
  for (let offset = 2; offset + 3 < bytes.length;) {
    if (bytes[offset++] !== 0xff) return false;
    while (bytes[offset] === 0xff) offset++;
    const marker = bytes[offset++];
    if (offset + 2 > bytes.length || marker === 0xda || marker === 0xd9) return false;
    const length = bytes.readUInt16BE(offset);
    if (length < 2 || offset + length > bytes.length) return false;
    if (marker === 0xc0 || marker === 0xc1 || marker === 0xc2) {
      if (length < 8) return false;
      const height = bytes.readUInt16BE(offset + 3);
      const width = bytes.readUInt16BE(offset + 5);
      return width > 0 && width <= 480 && height > 0 && height <= 480;
    }
    offset += length;
  }
  return false;
}

function localPath(value) {
  if (typeof value !== 'string' || value.length > 32767 || /^[\\/]{2}|\0/.test(value) || !path.isAbsolute(value)) return null;
  if (process.platform === 'win32' && (!/^[a-z]:[\\/]/i.test(value) || value.slice(2).includes(':'))) return null;
  return path.normalize(value);
}

async function replayFile(directory, value) {
  const candidate = localPath(value);
  const inside = (base, file) => {
    const relative = path.relative(base, file);
    return relative && relative !== '..' && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative);
  };
  if (!candidate || !inside(directory.configured, candidate)) return null;
  try {
    const resolved = localPath(await fs.promises.realpath(candidate));
    if (!resolved || !inside(directory.resolved, resolved)) return null;
    const stat = await fs.promises.stat(resolved);
    return stat.isFile() && stat.size > 0 ? { path: resolved, name: path.basename(candidate), size: stat.size, modifiedAt: stat.mtimeMs } : null;
  } catch { return null; }
}

function commandRequest(view, command) {
  if (view.status !== 'connected') throw new Error('OBS is disconnected');
  const { type, value } = command ?? {};
  switch (type) {
    case 'scene':
      // The mode shown when the user pressed the key must still be current.
      if (command.studio !== view.studio || !view.scenes.includes(value)) return notAvailable();
      return [view.studio ? 'SetCurrentPreviewScene' : 'SetCurrentProgramScene', { sceneName: value }];
    case 'transition':
      if (!view.studio || !view.preview || command.preview !== view.preview || view.preview === view.program) {
        return notAvailable();
      }
      return ['TriggerStudioModeTransition'];
    case 'record':
    case 'stream': {
      const output = type === 'record' ? view.recording : view.streaming;
      if (!output || output.phase || typeof value !== 'boolean') return notAvailable();
      if (value === output.active) return null;
      if (type === 'record') return [value ? 'StartRecord' : 'StopRecord'];
      return [value ? 'StartStream' : 'StopStream'];
    }
    case 'pause':
      if (!view.recording?.active || view.recording.phase || typeof value !== 'boolean') return notAvailable();
      return view.recording.paused === value ? null : [value ? 'PauseRecord' : 'ResumeRecord'];
    case 'save-replay':
      if (!view.replay?.active || view.replay.phase) return notAvailable();
      return ['SaveReplayBuffer'];
    case 'visibility':
      if (!view.sourceScene || command.scene !== view.sourceScene || typeof value !== 'boolean'
        || !view.items.some(({ id, visible }) => id === command.item && visible !== null)) return notAvailable();
      return ['SetSceneItemEnabled', { sceneName: view.sourceScene, sceneItemId: command.item, sceneItemEnabled: value }];
    case 'mute':
    case 'volume':
    case 'filter': {
      const detail = view.detail;
      if (!detail || command.item !== detail.id || command.scene !== view.sourceScene || command.source !== detail.name) {
        return notAvailable();
      }
      if (type === 'mute' && detail.muted !== null && typeof value === 'boolean') {
        return ['SetInputMute', { inputName: detail.name, inputMuted: value }];
      }
      if (type === 'volume' && detail.volume !== null && Number.isInteger(value) && value >= 0 && value <= 100) {
        return ['SetInputVolume', { inputName: detail.name, inputVolumeMul: value / 100 }];
      }
      if (type === 'filter' && typeof value === 'boolean' && detail.filters.some(({ name }) => name === command.filter)) {
        return ['SetSourceFilterEnabled', { sourceName: detail.name, filterName: command.filter, filterEnabled: value }];
      }
      return notAvailable();
    }
    default:
      return notAvailable();
  }
}

function confirmedCommand(view, { type, value, studio, preview, scene, item, source, filter }) {
  if (view.status !== 'connected') return false;
  switch (type) {
    case 'scene': return view.studio === studio && (studio ? view.preview : view.program) === value;
    case 'transition': return view.program === preview;
    case 'record': return view.recording?.active === value && !view.recording.phase;
    case 'stream': return view.streaming?.active === value && !view.streaming.phase;
    case 'pause': return view.recording?.active && view.recording.paused === value && !view.recording.phase;
    case 'visibility': return view.sourceScene === scene && view.items.find(({ id }) => id === item)?.visible === value;
    default: {
      const detail = view.detail;
      if (view.sourceScene !== scene || detail?.id !== item) return false;
      if (type === 'select-source') return true;
      if (detail.name !== source) return false;
      if (type === 'mute') return detail.muted === value;
      if (type === 'volume') return detail.volume !== null && Math.round(detail.volume * 100) === value;
      return type === 'filter' && detail.filters.find(({ name }) => name === filter)?.enabled === value;
    }
  }
}

class Obs extends EventEmitter {
  static fromFile(file, { createClient = createSocket } = {}) {
    const config = loadObsConfig(file);
    const obs = new Obs(config, makeClient(config, createClient));
    obs.settings = { file, createClient };
    return obs;
  }

  constructor(config, client = makeClient(config), confirmation) {
    super();
    this.config = config;
    this.confirmation = confirmation;
    /** @type {{ file: string, createClient: (config: any) => any } | undefined} Set by Obs.fromFile only. */
    this.settings;
    this.session = null;
    this.generation = 0;
    this.view = { ...emptyView(config.status), generation: this.generation, sampledAt: Date.now() };
    this.onStatus = (status) => this.connectionChanged(status);
    this.onEvent = (type, data) => this.receiveEvent(type, data);
    this.replaceClient(client);
  }

  replaceClient(client) {
    this.client?.off('status', this.onStatus);
    this.client?.off('event', this.onEvent);
    this.client?.stop();
    this.client = client;
    client?.on('status', this.onStatus);
    client?.on('event', this.onEvent);
  }

  reloadConfig() {
    if (!this.settings) return false;
    const config = loadObsConfig(this.settings.file);
    if (config.status === this.config.status && config.port === this.config.port && config.password === this.config.password) return false;
    this.config = config;
    this.replaceClient(makeClient(config, this.settings.createClient));
    this.connectionChanged(config.status);
    if (this.running) this.client?.start();
    return true;
  }

  get enabled() { return this.config.status === 'connecting'; }

  setEnabled(enabled) {
    if (typeof enabled !== 'boolean' || !this.settings) throw new Error('Choose whether OBS is enabled.');
    const { file } = this.settings;
    let data = {};
    try {
      const buffer = fs.readFileSync(file, 'utf8');
      if (Buffer.byteLength(buffer) > 64 * 1024) throw new Error('Invalid OBS settings.');
      data = JSON.parse(buffer.replace(/^\uFEFF/, ''));
      if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Invalid OBS settings.');
    } catch (error) {
      if (error.code !== 'ENOENT') throw new Error('Repair obs.json before changing OBS availability.');
    }
    writeJsonSettings(file, { ...data, enabled }, { space: 2, failure: 'Could not save OBS settings.' });
    this.reloadConfig();
    if (enabled && !this.enabled) throw new Error('Check the port and password in obs.json.');
    return { enabled: this.enabled };
  }

  start() {
    if (this.running) return;
    this.running = true;
    if (this.settings) this.stopWatch = watchMonitorConfig(this.settings.file, () => {
      if (this.running) this.reloadConfig();
    }, () => {});
    if (!this.reloadConfig()) this.client?.start();
  }

  stop() {
    this.running = false;
    this.stopWatch?.();
    this.stopWatch = null;
    this.client?.stop();
  }

  reconnect(generation) {
    if (!this.running || generation !== this.generation || !RETRYABLE.has(this.view.status)) {
      throw new Error('The OBS connection changed.');
    }
    if (this.reloadConfig()) return { ok: true };
    if (!this.client) throw new Error('Configure obs.json before reconnecting.');
    this.client.stop();
    this.client.start();
    return { ok: true };
  }

  setView(view) {
    this.view = { ...view, generation: this.generation, sampledAt: Date.now() };
    this.emit('update', this.view);
  }

  connectionChanged(status) {
    clearTimeout(this.session?.timer);
    this.generation++;
    this.session = status === 'syncing' ? { selection: null, sync: null, dirty: false, busy: false, switching: false, phases: {},
      timing: new ObsOutputTiming() } : null;
    this.setView(emptyView(status));
    if (this.session) this.refresh();
  }

  receiveEvent(type, data) {
    const session = this.session;
    if (!session) return;
    if (type === 'CurrentSceneCollectionChanging') {
      session.switching = true;
      session.timing.invalidate();
      clearTimeout(session.timer);
      session.timer = null;
      this.setView(emptyView('syncing'));
      return;
    }
    if (type === 'CurrentSceneCollectionChanged') session.switching = false;
    if (session.switching) return;
    if (type === 'ReplayBufferSaved') {
      if (session.savingReplay && typeof data.savedReplayPath === 'string') session.savingReplay.path = data.savedReplayPath;
      return;
    }
    if (Object.hasOwn(OUTPUT_EVENTS, type) && typeof data.outputState === 'string') {
      const output = OUTPUT_EVENTS[type];
      if (output !== 'replay') session.timing.invalidate(output);
      const phases = {
        OBS_WEBSOCKET_OUTPUT_STARTING: 'starting', OBS_WEBSOCKET_OUTPUT_STOPPING: 'stopping',
        OBS_WEBSOCKET_OUTPUT_RECONNECTING: 'reconnecting',
      };
      const phase = phases[data.outputState] ?? null;
      session.phases[output] = phase;
      if (this.view[output]) {
        const next = { ...this.view[output], phase };
        if (typeof data.outputActive === 'boolean') next.active = data.outputActive;
        if (output === 'recording') {
          if (data.outputState === 'OBS_WEBSOCKET_OUTPUT_PAUSED') next.paused = true;
          if (data.outputState === 'OBS_WEBSOCKET_OUTPUT_RESUMED' || !next.active) next.paused = false;
        }
        this.setView({ ...this.view, [output]: next });
      }
      this.scheduleRefresh();
      return;
    }

    if (type === 'InputMuteStateChanged' || type === 'InputVolumeChanged') {
      const detail = this.view.detail;
      if (typeof data.inputName === 'string' && detail?.name === data.inputName) {
        const field = type === 'InputMuteStateChanged' ? 'muted' : 'volume';
        const value = field === 'muted' ? data.inputMuted : data.inputVolumeMul;
        if ((field === 'muted' && typeof value === 'boolean') || (field === 'volume' && Number.isFinite(value))) {
          this.setView({ ...this.view, detail: { ...detail, [field]: value } });
          if (session.sync) session.dirty = true;
        }
      }
      return;
    }
    if (UPDATE_EVENTS.has(type)) this.scheduleRefresh();
  }

  scheduleRefresh() {
    const session = this.session;
    if (!session || session.switching) return;
    session.dirty = true;
    if (session.sync || session.timer) return;
    session.timer = setTimeout(() => this.refresh(), UPDATE_DELAY);
  }

  refresh() {
    const session = this.session;
    if (!session || session.switching) return Promise.resolve();
    clearTimeout(session.timer);
    session.timer = null;
    session.dirty = true;
    if (!session.sync) session.sync = this.readLoop(session);
    return session.sync;
  }

  async readLoop(session) {
    try {
      do {
        session.dirty = false;
        let result;
        try {
          result = await this.readModel(session);
        } catch (err) {
          if (session !== this.session || session.switching) return;
          if (session.dirty) continue;
          throw err;
        }
        if (session !== this.session || session.switching) return;
        // A request already on the wire may predate an event that arrived meanwhile.
        if (!session.dirty) {
          session.timing.seed(result.timings);
          this.setView(result.view);
        }
      } while (session.dirty);
    } catch {
      if (session === this.session) this.client.disconnect();
    } finally {
      session.sync = null;
    }
  }

  async readModel(session) {
    const request = (type, data) => {
      if (session !== this.session || session.switching) return Promise.reject(new Error('OBS session changed'));
      return this.client.request(type, data);
    };
    const pullOutput = (output, method) => request(method).then((reply) => ({ reply, sample: session.timing.sample(output, reply) }));
    const [scenes, record, stream, studioMode, replayData] = await Promise.all([
      request('GetSceneList'), pullOutput('recording', 'GetRecordStatus'), pullOutput('streaming', 'GetStreamStatus'), request('GetStudioModeEnabled'),
      request('GetReplayBufferStatus').catch(() => null),
    ]);
    const studio = studioMode.studioModeEnabled === true;
    const program = scenes.currentProgramSceneName ?? null;
    const preview = studio ? scenes.currentPreviewSceneName ?? null : null;
    const sourceScene = preview ?? program;
    const [itemList, specialInputs] = await Promise.all([
      sourceScene ? request('GetSceneItemList', { sceneName: sourceScene }) : null,
      request('GetSpecialInputs').catch(() => ({})),
    ]);
    const items = sourceView(itemList?.sceneItems);
    for (const [key, name] of Object.entries(specialInputs)) {
      if (typeof name !== 'string' || items.some((item) => item.name === name)) continue;
      items.push({ id: 'global:' + key, name, visible: null });
    }
    const selection = session.selection;
    const selected = selection?.scene === sourceScene
      ? items.find(({ id }) => id === selection.item) ?? items[0] : items[0];
    const detail = selected ? await this.readSource(request, selected) : null;
    const recording = readRecording(record.reply);
    const streaming = readStream(stream.reply);
    recording.phase = session.phases.recording ?? recording.phase;
    streaming.phase = session.phases.streaming ?? streaming.phase;
    const replay = typeof replayData?.outputActive === 'boolean'
      ? { active: replayData.outputActive, phase: session.phases.replay ?? null, lastSaved: session.lastReplay ?? null } : null;

    return { view: { status: 'connected', studio, program, preview, recording, streaming, replay,
      scenes: array(scenes.scenes).map((scene) => scene?.sceneName).filter((name) => typeof name === 'string'), sourceScene, items, detail },
    timings: { recording: record.sample, streaming: stream.sample } };
  }

  outputTiming(generation, visible = () => true) {
    const session = this.session;
    const client = this.client;
    const live = () => this.generation === generation && this.session === session && this.client === client
      && !session.switching && this.view.status === 'connected' && visible();
    if (!session || !client || !live()) return null;
    return session.timing.read((method) => client.request(method), live,
      { recording: this.view.recording?.active, streaming: this.view.streaming?.active });
  }

  async saveReplay(command, session) {
    commandRequest(this.view, command);
    const client = this.client;
    const requireSession = () => {
      if (this.session !== session || this.client !== client || session.switching) throw new Error('OBS connection interrupted');
    };
    const lastPath = async () => (await client.request('GetLastReplayBufferReplay').catch(() => null))?.savedReplayPath;
    const [record, priorPath] = await Promise.all([client.request('GetRecordDirectory').catch(() => null), lastPath()]);
    requireSession();
    const configured = localPath(record?.recordDirectory);
    const resolved = configured && localPath(await fs.promises.realpath(configured).catch(() => null));
    const folder = resolved && await fs.promises.stat(resolved).catch(() => null);
    if (!folder?.isDirectory()) throw new Error('The OBS recording folder is unavailable for replay verification.');
    const directory = { configured, resolved };
    const prior = await replayFile(directory, priorPath);
    requireSession();
    const request = commandRequest(this.view, command);
    const pending = {};
    session.savingReplay = pending;
    const requestedAt = Date.now();
    try {
      await client.request(...request);
      /** @type {{ name: string, path: string, modifiedAt: number, size: number } | undefined} */
      let saved;
      await confirmState(async () => {
        requireSession();
        const reported = pending.path ?? await lastPath();
        requireSession();
        const file = await replayFile(directory, reported);
        requireSession();
        if (!file || file.modifiedAt < requestedAt - 1000) return false;
        if (prior ? file.path === prior.path && file.modifiedAt === prior.modifiedAt && file.size === prior.size
          : !pending.path && reported === priorPath) return false;
        saved = file;
        return true;
      }, 'OBS accepted the save but Lastra could not verify a new replay file.', this.confirmation);
      requireSession();
      session.lastReplay = { name: saved.name, verifiedAt: Date.now() };
      if (this.view.replay) this.setView({ ...this.view, replay: { ...this.view.replay, lastSaved: session.lastReplay } });
      return { ok: true, message: `Replay saved · ${saved.name}` };
    } finally { session.savingReplay = null; }
  }

  async readSource(request, { id, name }) {
    // Visual-only sources and OBS versions with partial capabilities can
    // reject individual requests. Keep the remaining controls available.
    const optional = (type, data) => request(type, data).catch(() => ({}));
    const [mute, volume, filters] = await Promise.all([
      optional('GetInputMute', { inputName: name }), optional('GetInputVolume', { inputName: name }),
      optional('GetSourceFilterList', { sourceName: name }),
    ]);
    return {
      id, name, muted: typeof mute.inputMuted === 'boolean' ? mute.inputMuted : null,
      volume: numberOrNull(volume.inputVolumeMul),
      filters: array(filters.filters).filter((filter) => typeof filter?.filterName === 'string')
        .map(({ filterName, filterEnabled }) => ({ name: filterName, enabled: filterEnabled === true })),
    };
  }

  async previewScene(generation) {
    const session = this.session;
    const target = screenshotTarget(this.view);
    const unavailable = { ok: false, message: 'OBS scene preview unavailable.' };
    if (!session || session.switching || generation !== this.generation || !target) return unavailable;
    if (session.previewing) return { ok: false, busy: true };
    session.previewing = true;
    try {
      const { imageData } = await this.client.request('GetSourceScreenshot', {
        sourceName: target.scene, imageFormat: 'jpg', imageWidth: 480, imageHeight: 480, imageCompressionQuality: 48,
      });
      const current = screenshotTarget(this.view);
      if (this.session !== session || session.switching || current?.scene !== target.scene || current.bus !== target.bus) return unavailable;
      if (typeof imageData !== 'string' || imageData.length > MAX_PREVIEW_IMAGE || !PREVIEW_HEADER.test(imageData)) return unavailable;
      const body = imageData.replace(PREVIEW_HEADER, '');
      if (body.length % 4 || !/^[A-Za-z0-9+/]+={0,2}$/.test(body)) return unavailable;
      if (!boundedJpeg(body)) return unavailable;
      return { ok: true, ...target, image: PREVIEW_PREFIX + body };
    } catch {
      return unavailable;
    } finally {
      session.previewing = false;
    }
  }

  async withCommandSequence(run) {
    const session = this.session;
    if (!session || session.switching) throw new Error('OBS connection interrupted');
    if (session.busy || this.commandOwner) throw new Error('An OBS command is already running');
    const owner = Symbol('OBS command sequence');
    this.commandOwner = owner;
    try {
      return await run((command) => {
        if (this.commandOwner !== owner || this.session !== session || session.switching) throw new Error('OBS connection interrupted');
        return this.change(command, owner);
      });
    } finally {
      this.commandOwner = null;
    }
  }

  async change(command, owner, allowed = () => true) {
    if (this.commandOwner && this.commandOwner !== owner) throw new Error('An OBS command sequence is already running');
    const checkReview = () => { if (!allowed()) throw new Error('The OBS review ended.'); };
    checkReview();
    if (command?.type === 'reconnect') return this.reconnect(command.generation);
    const session = this.session;
    if (!session || command?.generation !== this.generation) throw new Error('OBS connection changed');
    if (session.busy) throw new Error('An OBS command is already running');
    session.busy = true;
    try {
      if (command.type === 'save-replay') return await this.saveReplay(command, session);
      if (command.type === 'select-source') {
        if (this.view.status !== 'connected' || command.scene !== this.view.sourceScene
          || !this.view.items.some(({ id }) => id === command.item)) return notAvailable();
        session.selection = { scene: command.scene, item: command.item };
      } else {
        const request = commandRequest(this.view, command);
        if (request) await this.client.request(...request);
      }
      await confirmState(async () => {
        checkReview();
        await this.refresh();
        checkReview();
        if (this.session !== session || session.switching) throw new Error('OBS connection interrupted');
        return confirmedCommand(this.view, command);
      }, 'OBS did not confirm the requested state.', this.confirmation);
      return { ok: true };
    } finally {
      session.busy = false;
    }
  }
}

module.exports = { Obs, loadObsConfig, commandRequest };
