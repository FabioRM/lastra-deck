'use strict';

const assert = require('node:assert/strict');
const { writeFileSync } = require('node:fs');
const { join } = require('node:path');
const { test } = require('node:test');
const { Obs, loadObsConfig } = require('../src/main/obs');
const { ObsSocket } = require('../src/main/obs-socket');
const { tempDir } = require('./helpers/temp-dir');

function fakeServer(onRequest = () => ({}), options) {
  const sockets = [];
  class FakeSocket extends EventTarget {
    constructor(url, protocol) {
      super();
      this.url = url;
      this.protocol = protocol;
      this.sent = [];
      sockets.push(this);
    }
    send(raw) {
      const frame = JSON.parse(raw);
      this.sent.push(frame);
      if (frame.op !== 6) return;
      const { requestType, requestId, requestData } = frame.d;
      queueMicrotask(() => {
        if (this.closed) return;
        try {
          const responseData = onRequest(requestType, requestData);
          if (responseData === undefined) return;
          this.message(7, { requestType, requestId, requestStatus: { result: true, code: 100 }, responseData });
        } catch {
          this.message(7, { requestType, requestId, requestStatus: { result: false, code: 600, comment: 'internal detail' } });
        }
      });
    }
    message(op, data) {
      this.dispatchEvent(new MessageEvent('message', { data: JSON.stringify({ op, d: data }) }));
    }
    identify(authentication) {
      this.message(0, { authentication, rpcVersion: 1 });
      this.message(2, { negotiatedRpcVersion: 1 });
    }
    event(eventType, eventData = {}) {
      this.message(5, { eventType, eventData });
    }
    close() {
      this.closed = true;
    }
    serverClose(code) {
      const event = new Event('close');
      event.code = code;
      this.dispatchEvent(event);
    }
  }
  const client = new ObsSocket({ port: 4455, password: 'deck-pass' }, { Socket: FakeSocket, timeout: 500, retry: 5, ...options });
  return { client, sockets };
}

async function until(predicate) {
  const deadline = Date.now() + 3000;
  while (!predicate()) {
    if (Date.now() >= deadline) throw new Error('Expected OBS state was not received');
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

test('OBS is disabled without a config file and credentials stay in the main process', (t) => {
  const directory = tempDir(t, 'lastra-obs-');
  const file = join(directory, 'obs.json');
  assert.deepEqual(loadObsConfig(file, {}), { status: 'disabled' });
  writeFileSync(file, '{"port":4455,"password":"from-file"}');
  const config = loadObsConfig(file, { LASTRA_OBS_PASSWORD: 'from-env' });
  assert.deepEqual(config, { status: 'connecting', port: 4455, password: 'from-env' });
  assert.equal(JSON.stringify(new Obs(config).view).includes('from-env'), false);
  writeFileSync(file, '{"port":-1}');
  assert.deepEqual(loadObsConfig(file, {}), { status: 'invalid' });
});

test('authenticates with v5, correlates responses, and closes without reconnecting', async (t) => {
  const { client, sockets } = fakeServer((type) => {
    if (type === 'Reject') throw new Error('failed');
    return { value: 42 };
  });
  t.after(() => client.stop());
  client.start();
  const socket = sockets[0];
  assert.equal(socket.url, 'ws://127.0.0.1:4455');
  assert.equal(socket.protocol, 'obswebsocket.json');
  socket.identify({ salt: 'salt', challenge: 'challenge' });
  const identify = socket.sent[0];
  assert.equal(identify.op, 1);
  assert.equal(identify.d.rpcVersion, 1);
  assert.equal(identify.d.authentication, 'Kg3mna09neoMN1bT2OjBq/FDe9aTDbZY2uXHuetA2tY=');
  assert.equal((identify.d.eventSubscriptions & (1 << 16)) > 0, false);
  assert.deepEqual(await client.request('GetSomething'), { value: 42 });
  await assert.rejects(client.request('Reject'), /rejected the command \(code 600\)$/);
  const pending = client.request('Pending');
  client.stop();
  await assert.rejects(pending, /interrupted/);
  assert.equal(socket.closed, true);
  assert.equal(sockets.length, 1);
});

test('does not reconnect when OBS revokes the session', async (t) => {
  const { client, sockets } = fakeServer();
  t.after(() => client.stop());
  let status;
  client.on('status', (next) => { status = next; });
  client.start();
  sockets[0].identify();
  sockets[0].serverClose(4011);
  assert.equal(status, 'revoked');
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(sockets.length, 1);
});

test('a silent transport reconnects when the idle heartbeat receives no response', async (t) => {
  const { client, sockets } = fakeServer(() => undefined, { heartbeatMs: 15, timeout: 30 });
  t.after(() => client.stop());
  client.start();
  sockets[0].identify();
  await until(() => sockets.length === 2);
  assert.equal(sockets[0].closed, true);
  assert.ok(sockets[0].sent.some(({ d }) => d.requestType === 'GetVersion'));
});

test('OBS reloads corrected settings and refreshes a manually reopened session without resetting its generation', async (t) => {
  let obs;
  t.after(() => obs?.stop());
  const directory = tempDir(t, 'lastra-obs-settings-');
  const file = join(directory, 'obs.json');
  const created = [];
  obs = Obs.fromFile(file, { createClient(config) {
    const server = fakeServer((type) => {
      if (type === 'GetRecordStatus') return { outputActive: config.port === 4460, outputPaused: false };
      if (type === 'GetStreamStatus') return { outputActive: false };
      return {};
    });
    created.push({ ...server, port: config.port });
    return server.client;
  } });
  obs.start();
  assert.equal(obs.view.status, 'disabled');
  writeFileSync(file, '{"port":4459}');
  await until(() => created[0]?.sockets.length === 1);
  created[0].sockets[0].serverClose(4009);
  assert.equal(obs.view.status, 'authentication');
  const oldGeneration = obs.view.generation;
  writeFileSync(file, '{"port":4460}');
  await until(() => created[1]?.sockets.length === 1);
  assert.deepEqual(created.map(({ port }) => port), [4459, 4460]);
  created[1].sockets[0].identify();
  await until(() => obs.view.status === 'connected');
  assert.equal(obs.view.recording.active, true);
  assert.ok(obs.view.generation > oldGeneration);
  await assert.rejects(obs.change({ type: 'record', value: false, generation: oldGeneration }), /connection changed/);
  created[1].sockets[0].serverClose(4011);
  assert.equal(obs.view.canReconnect, true);
  await obs.change({ type: 'reconnect', generation: obs.view.generation });
  created[1].sockets[1].identify();
  await until(() => obs.view.status === 'connected');
  assert.equal(obs.view.recording.active, true);
  assert.equal(Boolean(obs.view.canReconnect), false);
});

test('syncs OBS state, sources, preview scenes, and state after reconnecting', async (t) => {
  const requests = [];
  let studio = true;
  let active = false;
  let paused = false;
  let streaming = false;
  let muted = false;
  let volume = 0.8;
  let visible = true;
  let filter = true;
  let program = 'Scene A';
  let preview = 'Scene B';
  const { client, sockets } = fakeServer((type, data) => {
    requests.push([type, data]);
    switch (type) {
      case 'GetSceneList': return {
        currentProgramSceneName: program, currentPreviewSceneName: studio ? preview : null,
        scenes: [{ sceneName: 'Scene A' }, { sceneName: 'Scene B' }],
      };
      case 'GetRecordStatus': return { outputActive: active, outputPaused: paused };
      case 'GetStreamStatus': return { outputActive: streaming, outputReconnecting: false };
      case 'GetStudioModeEnabled': return { studioModeEnabled: studio };
      case 'GetSceneItemList': return { sceneItems: [{ sceneItemId: 3, sourceName: 'Media', sceneItemEnabled: visible }] };
      case 'GetSpecialInputs': return { mic1: 'Mic/Aux', desktop1: null };
      case 'GetInputMute': return { inputMuted: muted };
      case 'GetInputVolume': return { inputVolumeMul: volume };
      case 'GetSourceFilterList': return { filters: [{ filterName: 'Filter', filterEnabled: filter }] };
      case 'StartStream': streaming = true; return {};
      case 'StopStream': streaming = false; return {};
      case 'SetInputMute': muted = data.inputMuted; return {};
      case 'SetInputVolume': volume = data.inputVolumeMul; return {};
      case 'SetSourceFilterEnabled': filter = data.filterEnabled; return {};
      case 'SetSceneItemEnabled': visible = data.sceneItemEnabled; return {};
      case 'SetCurrentPreviewScene': preview = data.sceneName; return {};
      case 'SetCurrentProgramScene': program = data.sceneName; return {};
      case 'TriggerStudioModeTransition': [preview, program] = [program, preview]; return {};
      default: throw new Error('unknown request');
    }
  });
  const obs = new Obs({ status: 'connecting' }, client);
  t.after(() => obs.stop());
  obs.start();
  sockets[0].identify();
  await until(() => obs.view.status === 'connected');
  assert.equal(obs.view.sourceScene, 'Scene B');
  assert.equal(obs.view.program, 'Scene A');
  assert.deepEqual(obs.view.items, [
    { id: 3, name: 'Media', visible: true }, { id: 'global:mic1', name: 'Mic/Aux', visible: null },
  ]);
  const generation = obs.view.generation;
  const change = (type, settings) => obs.change({ type, generation, ...settings });
  const media = { item: 3, scene: 'Scene B', source: 'Media' };

  await change('stream', { value: true });
  assert.equal(obs.view.streaming.active, true);
  await change('stream', { value: false });
  assert.equal(obs.view.streaming.active, false);

  await change('mute', { ...media, value: true });
  assert.equal(obs.view.detail.muted, true);
  await change('volume', { ...media, value: 30 });
  assert.equal(obs.view.detail.volume, 0.3);
  await change('filter', { ...media, filter: 'Filter', value: false });
  assert.equal(obs.view.detail.filters[0].enabled, false);
  await change('visibility', { ...media, value: false });
  assert.equal(obs.view.items[0].visible, false);
  await assert.rejects(change('mute', { ...media, scene: 'Scene A', value: false }), /no longer available/);
  await assert.rejects(change('visibility', { scene: 'Scene B', item: 'global:mic1', value: false }), /no longer available/);
  await change('select-source', { scene: 'Scene B', item: 'global:mic1' });
  assert.equal(obs.view.detail.name, 'Mic/Aux');

  active = true;
  paused = true;
  sockets[0].event('RecordStateChanged', { outputActive: true, outputState: 'OBS_WEBSOCKET_OUTPUT_PAUSED' });
  assert.deepEqual(obs.view.recording, { active: true, paused: true, phase: null });
  sockets[0].event('InputVolumeChanged', { inputName: 'Mic/Aux', inputVolumeMul: 0.4 });
  assert.equal(obs.view.detail.volume, 0.4);
  await change('transition', { preview: 'Scene B' });
  assert.equal(obs.view.program, 'Scene B');
  await assert.rejects(change('transition', { preview: 'Scene B' }), /no longer available/);
  await change('scene', { studio: true, value: 'Scene B' });
  assert.ok(requests.some(([type]) => type === 'SetCurrentPreviewScene'));

  sockets[0].event('CurrentSceneCollectionChanging');
  assert.equal(obs.view.status, 'syncing');
  await assert.rejects(change('stream', { value: true }), /disconnected/);
  sockets[0].event('CurrentSceneCollectionChanged');
  await until(() => obs.view.status === 'connected');
  studio = false;
  sockets[0].event('StudioModeStateChanged');
  await until(() => !obs.view.studio);
  await assert.rejects(change('scene', { studio: true, value: 'Scene A' }), /no longer available/);
  await change('scene', { studio: false, value: 'Scene A' });
  assert.equal(obs.view.program, 'Scene A');

  sockets[0].serverClose(1006);
  assert.equal(obs.view.recording, null);
  await until(() => sockets.length === 2);
  active = false;
  paused = false;
  sockets[1].identify();
  await until(() => obs.view.status === 'connected');
  assert.equal(obs.view.recording.active, false);
  await assert.rejects(change('scene', { studio: false, value: 'Scene B' }), /OBS connection changed/);
});

test('OBS confirms delayed state without resending a command and rejects unconfirmed output changes', async (t) => {
  const writes = [];
  let polls = 0;
  const { client, sockets } = fakeServer((type) => {
    switch (type) {
      case 'GetSceneList': return { scenes: [] };
      case 'GetRecordStatus': return { outputActive: false, outputPaused: false };
      case 'GetStreamStatus': return { outputActive: writes.includes('StartStream') && ++polls >= 3 };
      case 'GetStudioModeEnabled': return { studioModeEnabled: false };
      case 'GetSpecialInputs': return {};
      case 'StartStream':
      case 'StartRecord': writes.push(type); return {};
      default: throw new Error(type);
    }
  });
  const obs = new Obs({ status: 'connecting' }, client, { timeoutMs: 130, intervalMs: 5 });
  t.after(() => obs.stop());
  obs.start();
  sockets[0].identify();
  await until(() => obs.view.status === 'connected');
  const generation = obs.view.generation;
  const pending = obs.change({ type: 'stream', value: true, generation });
  await until(() => writes.length === 1);
  await assert.rejects(obs.change({ type: 'record', value: true, generation }), /already running/);
  assert.deepEqual(await pending, { ok: true });
  assert.equal(obs.view.streaming.active, true);
  await assert.rejects(obs.change({ type: 'record', value: true, generation }), /did not confirm/);
  assert.equal(obs.view.recording.active, false);
  assert.deepEqual(writes, ['StartStream', 'StartRecord']);
});

test('reviewed OBS writes check permission at dispatch and after native readback', async (t) => {
  let allowed = false;
  let active = false;
  let reads = 0;
  const writes = [];
  const { client, sockets } = fakeServer((type) => {
    switch (type) {
      case 'GetSceneList': return { scenes: [] };
      case 'GetRecordStatus': return { outputActive: false, outputPaused: false };
      case 'GetStreamStatus':
        reads++;
        if (active) allowed = false;
        return { outputActive: active };
      case 'GetStudioModeEnabled': return { studioModeEnabled: false };
      case 'GetSpecialInputs': return {};
      case 'StartStream': active = true; writes.push(type); return {};
      case 'StopStream': active = false; writes.push(type); return {};
      default: throw new Error(type);
    }
  });
  const obs = new Obs({ status: 'connecting' }, client);
  t.after(() => obs.stop());
  obs.start();
  sockets[0].identify();
  await until(() => obs.view.status === 'connected');
  const command = { type: 'stream', value: true, generation: obs.view.generation };
  const readBefore = reads;
  await assert.rejects(obs.change(command, undefined, () => allowed), /review ended/);
  assert.deepEqual(writes, []);
  assert.equal(reads, readBefore);
  allowed = true;
  await assert.rejects(obs.change(command, undefined, () => allowed), /review ended/);
  assert.deepEqual(writes, ['StartStream']);
  assert.equal(reads, readBefore + 1);
  assert.equal(obs.view.streaming.active, true);
  assert.deepEqual(await obs.change({ ...command, value: false }), { ok: true });
  assert.deepEqual(writes, ['StartStream', 'StopStream']);
});

test('OBS follows replay status and confirms new files from a saved event or provider readback', async (t) => {
  const directory = tempDir(t, 'lastra-replay-');
  let active = true;
  let saves = 0;
  let latest;
  const { client, sockets } = fakeServer((type) => {
    switch (type) {
      case 'GetSceneList': return { scenes: [] };
      case 'GetRecordStatus': return { outputActive: false, outputPaused: false };
      case 'GetStreamStatus': return { outputActive: false };
      case 'GetReplayBufferStatus': return { outputActive: active };
      case 'GetRecordDirectory': return { recordDirectory: directory };
      case 'GetLastReplayBufferReplay': return { savedReplayPath: latest };
      case 'SaveReplayBuffer': {
        latest = join(directory, `clip-${++saves}.mkv`);
        writeFileSync(latest, 'fixture replay');
        if (saves === 1) sockets[0].event('ReplayBufferSaved', { savedReplayPath: latest });
        return {};
      }
      default: return {};
    }
  });
  const obs = new Obs({ status: 'connecting' }, client, { timeoutMs: 1000, intervalMs: 20 });
  t.after(() => obs.stop());
  obs.start();
  sockets[0].identify();
  await until(() => obs.view.replay?.active);
  const command = { type: 'save-replay', generation: obs.view.generation };
  assert.deepEqual(await obs.change(command), { ok: true, message: 'Replay saved · clip-1.mkv' });
  assert.deepEqual(await obs.change(command), { ok: true, message: 'Replay saved · clip-2.mkv' });
  assert.equal(obs.view.replay.lastSaved.name, 'clip-2.mkv');
  assert.equal(JSON.stringify(obs.view).includes(directory), false);
  active = false;
  sockets[0].event('ReplayBufferStateChanged', { outputState: 'OBS_WEBSOCKET_OUTPUT_STOPPED', outputActive: false });
  assert.equal(obs.view.replay.active, false);
  await assert.rejects(obs.change(command), /no longer available/);
  assert.equal(saves, 2);
});

test('an unchanged prior replay or a file outside the recording folder cannot confirm a save', async (t) => {
  const directory = tempDir(t, 'lastra-replay-');
  const outside = tempDir(t, 'lastra-outside-replay-');
  let latest = join(directory, 'previous.mkv');
  writeFileSync(latest, 'prior replay');
  let saves = 0;
  const { client, sockets } = fakeServer((type) => {
    switch (type) {
      case 'GetSceneList': return { scenes: [] };
      case 'GetRecordStatus': return { outputActive: false, outputPaused: false };
      case 'GetStreamStatus': return { outputActive: false };
      case 'GetReplayBufferStatus': return { outputActive: true };
      case 'GetRecordDirectory': return { recordDirectory: directory };
      case 'GetLastReplayBufferReplay': return { savedReplayPath: latest };
      case 'SaveReplayBuffer':
        if (++saves === 2) {
          latest = join(outside, 'external.mkv');
          writeFileSync(latest, 'external replay');
        }
        sockets[0].event('ReplayBufferSaved', { savedReplayPath: latest });
        return {};
      default: return {};
    }
  });
  const obs = new Obs({ status: 'connecting' }, client, { timeoutMs: 140, intervalMs: 10 });
  t.after(() => obs.stop());
  obs.start();
  sockets[0].identify();
  await until(() => obs.view.replay?.active);
  const command = { type: 'save-replay', generation: obs.view.generation };
  for (let attempt = 1; attempt <= 2; attempt++) {
    await assert.rejects(obs.change(command), /could not verify a new replay file/);
    assert.equal(saves, attempt);
    assert.equal(obs.view.replay.lastSaved, null);
  }
});

test('OBS scene previews use the current bus, read once at a time and discard stale or out-of-bounds images', async (t) => {
  const jpeg = (width, height) => Buffer.from([
    0xff, 0xd8, 0xff, 0xc0, 0, 8, 8, height >>> 8, height & 255, width >>> 8, width & 255, 1, 0xff, 0xd9,
  ]).toString('base64');
  let studioModeEnabled = false;
  let holdResponse = false;
  let imageData = `data:image/jpg;base64,${jpeg(480, 270)}`;
  const requests = [];
  const { client, sockets } = fakeServer((type, data) => {
    switch (type) {
      case 'GetSceneList': return { scenes: [{ sceneName: 'Main' }, { sceneName: 'Next' }],
        currentProgramSceneName: 'Main', currentPreviewSceneName: 'Next' };
      case 'GetRecordStatus': return { outputActive: false, outputPaused: false };
      case 'GetStreamStatus': return { outputActive: false };
      case 'GetStudioModeEnabled': return { studioModeEnabled };
      case 'GetSourceScreenshot':
        requests.push(data);
        return holdResponse ? undefined : { imageData };
      default: return {};
    }
  });
  const obs = new Obs({ status: 'connecting' }, client);
  t.after(() => obs.stop());
  obs.start();
  sockets[0].identify();
  await until(() => obs.view.status === 'connected');
  const generation = obs.view.generation;
  assert.equal((await obs.previewScene(generation - 1)).ok, false);
  assert.deepEqual(await obs.previewScene(generation), { ok: true, scene: 'Main', bus: 'Program', image: `data:image/jpeg;base64,${jpeg(480, 270)}` });
  assert.deepEqual(requests[0], { sourceName: 'Main', imageFormat: 'jpg', imageWidth: 480, imageHeight: 480, imageCompressionQuality: 48 });
  holdResponse = true;
  const stale = obs.previewScene(generation);
  await until(() => requests.length === 2);
  assert.deepEqual(await obs.previewScene(generation), { ok: false, busy: true });
  studioModeEnabled = true;
  sockets[0].event('StudioModeStateChanged');
  await until(() => obs.view.studio);
  const query = sockets[0].sent.filter(({ d }) => d.requestType === 'GetSourceScreenshot').at(-1).d;
  sockets[0].message(7, { requestType: query.requestType, requestId: query.requestId, requestStatus: { result: true }, responseData: { imageData } });
  assert.equal((await stale).ok, false);
  holdResponse = false;
  assert.deepEqual(await obs.previewScene(generation), { ok: true, scene: 'Next', bus: 'Preview', image: `data:image/jpeg;base64,${jpeg(480, 270)}` });
  imageData = `data:image/jpg;base64,${jpeg(4096, 270)}`;
  assert.equal((await obs.previewScene(generation)).ok, false);
  imageData = 'https://example.com/unapproved.jpg';
  assert.equal((await obs.previewScene(generation)).ok, false);
});
