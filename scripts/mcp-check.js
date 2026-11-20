// @ts-check
'use strict';

const path = require('node:path');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const { performance } = require('node:perf_hooks');
const { parseArgs } = require('node:util');
const { readFrames, writeFrame } = require('../src/main/mcp-link');

const PROTOCOLS = ['2025-06-18', '2025-03-26', '2024-11-05'];
const SERVER = path.join(__dirname, '..', 'extensions', 'lastra-mcp', 'stdio.js');
const QUERY = { query: 'copy', limit: 5 };

function connect(env = process.env) {
  const child = spawn(process.execPath, [SERVER], { env, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
  const closed = once(child, 'close').catch(() => []);
  let stopped = false;
  let number = 0;
  let pending;
  child.stderr.resume();

  function finish(error, result) {
    if (!pending) return;
    const call = pending;
    pending = undefined;
    clearTimeout(call.timer);
    if (error) call.reject(new Error(error));
    else call.resolve(result);
  }
  function stop(error) {
    stopped = true;
    finish(error);
    if (child.exitCode === null && child.signalCode === null) child.kill();
  }

  child.on('error', () => stop('Could not start the Lastra stdio server.'));
  child.on('exit', () => stop('The Lastra stdio server exited during the check.'));
  child.stdin.on('error', () => stop('Could not write to the Lastra stdio server.'));
  child.stdout.on('error', () => stop('Could not read from the Lastra stdio server.'));
  readFrames(child.stdout, (frame) => {
    if (stopped) return;
    if (frame.jsonrpc !== '2.0') return stop('Invalid JSON-RPC response from the Lastra stdio server.');
    if (frame.id === undefined && typeof frame.method === 'string') return;
    if (!pending || frame.id !== pending.id || Object.hasOwn(frame, 'error') === Object.hasOwn(frame, 'result')) {
      return stop('Unexpected JSON-RPC response from the Lastra stdio server.');
    }
    finish(frame.error ? `${pending.method} returned a JSON-RPC error.` : undefined, frame.result);
  }, () => stop('Could not decode the Lastra stdio response.'));

  return {
    request(method, params = {}) {
      if (stopped || pending) throw new Error('The Lastra check client is unavailable.');
      const id = ++number;
      return new Promise((resolve, reject) => {
        pending = { id, method, resolve, reject, timer: setTimeout(() => stop(`${method} timed out.`), 8_000) };
        try { writeFrame(child.stdin, { jsonrpc: '2.0', id, method, params }); }
        catch { stop(`Could not send ${method}.`); }
      });
    },
    notify(method) {
      writeFrame(child.stdin, { jsonrpc: '2.0', method });
    },
    async close() {
      child.stdin.end();
      const deadline = setTimeout(() => stop('The Lastra stdio session did not close.'), 2_000);
      await closed;
      clearTimeout(deadline);
    },
  };
}

async function listing(client, method, key, identifier = 'name') {
  const items = [];
  const cursors = new Set();
  let cursor;
  do {
    const response = await client.request(method, cursor ? { cursor } : {});
    if (!Array.isArray(response?.[key])) throw new Error(`${method} did not return a collection.`);
    items.push(...response[key]);
    cursor = response.nextCursor;
    if (cursor !== undefined && (typeof cursor !== 'string' || !cursor || cursors.has(cursor) || cursors.size >= 64)) {
      throw new Error(`${method} returned an invalid or repeated cursor.`);
    }
    cursors.add(cursor);
  } while (cursor);
  const ids = items.map((item) => item?.[identifier]);
  if (new Set(ids).size !== ids.length || ids.some((id) => typeof id !== 'string' || !id)) {
    throw new Error(`${method} returned missing or duplicate identifiers.`);
  }
  return items;
}

async function tool(client, name, args) {
  const packet = await client.request('tools/call', { name, arguments: args });
  if (packet?.isError || packet?.content?.[0]?.type !== 'text') throw new Error(`${name} returned a tool error.`);
  try { return packet.structuredContent ?? JSON.parse(packet.content[0].text); }
  catch { throw new Error(`${name} did not return structured data.`); }
}

async function latency(sample, rounds) {
  const timings = [];
  for (let i = 0; i < rounds; i++) {
    const begin = performance.now();
    await sample();
    timings.push(performance.now() - begin);
  }
  timings.sort((a, b) => a - b);
  const at = (fraction) => Math.round(timings[Math.max(0, Math.ceil(rounds * fraction) - 1)] * 100) / 100;
  return { count: rounds, minMs: at(0), p50Ms: at(.5), p95Ms: at(.95), maxMs: at(1) };
}

async function check({ protocol = PROTOCOLS[0], live = false, rounds = 5, env = process.env } = {}) {
  if (!PROTOCOLS.includes(protocol)) throw new Error('Choose a supported MCP protocol revision.');
  if (!Number.isInteger(rounds) || rounds < 1 || rounds > 120) throw new Error('Choose from 1 to 120 rounds.');
  const { LASTRA_AGENT_CREDENTIAL: credential, ...environment } = env;
  if (live && !credential) throw new Error('Set LASTRA_AGENT_CREDENTIAL in the environment for a live check.');
  const client = connect(live ? { ...environment, LASTRA_AGENT_CREDENTIAL: credential } : environment);
  try {
    const init = await client.request('initialize', { protocolVersion: protocol, capabilities: {}, clientInfo: { name: 'Lastra check', version: '1' } });
    if (init?.serverInfo?.name !== 'lastra' || init?.protocolVersion !== protocol) throw new Error('MCP protocol negotiation did not match the request.');
    client.notify('notifications/initialized');
    const tools = await listing(client, 'tools/list', 'tools');
    const resources = await listing(client, 'resources/list', 'resources', 'uri');
    const templates = await listing(client, 'resources/templates/list', 'resourceTemplates', 'uriTemplate');
    const prompts = await listing(client, 'prompts/list', 'prompts');
    if (!tools.every(({ inputSchema }) => inputSchema?.type === 'object')
        || !tools.some(({ name, outputSchema }) => name === 'capabilities' && Boolean(outputSchema) === (protocol === PROTOCOLS[0]))) {
      throw new Error('The Lastra tool schemas differ from the negotiated MCP protocol.');
    }
    const capabilities = await tool(client, 'capabilities', {});
    const grants = capabilities?.tools?.filter(({ status, prerequisite }) => status === 'connected' && prerequisite?.startsWith('Running Windows'));
    if (!Array.isArray(grants) || !Number.isSafeInteger(capabilities.version) || !capabilities.connection?.status) {
      throw new Error('Lastra returned invalid capability metadata.');
    }
    const connected = capabilities.connection.status === 'connected';
    const timings = {};
    if (!live || connected) {
      timings.ping = await latency(() => client.request('ping'), rounds);
      timings.catalog = await latency(() => tool(client, 'search_catalog', QUERY), rounds);
      if (connected) {
        timings.connection = await latency(() => tool(client, 'connection', {}), rounds);
        if (grants.some(({ name }) => name === 'provider_status')) timings.providers = await latency(() => tool(client, 'provider_status', {}), rounds);
      }
    }
    return { ok: !live || connected, protocol, server: init.serverInfo.version, catalogVersion: capabilities.version,
      mode: live ? 'live' : 'offline', connection: connected ? 'connected' : 'unavailable',
      discovered: { tools: tools.length, resources: resources.length, templates: templates.length, prompts: prompts.length },
      liveTools: grants.map(({ name }) => name).sort(), timings };
  } finally {
    await client.close();
  }
}

async function main(argv) {
  const { values } = parseArgs({ args: argv, options: {
    live: { type: 'boolean' }, protocol: { type: 'string' }, rounds: { type: 'string', default: '5' }, help: { type: 'boolean' },
  } });
  if (values.help) {
    process.stdout.write('Usage: node scripts/mcp-check.js [--live] [--protocol YYYY-MM-DD] [--rounds 1-120]\n');
    return;
  }
  const report = await check({ protocol: values.protocol, live: values.live, rounds: Number(values.rounds) });
  process.stdout.write(JSON.stringify(report, null, 2) + '\n');
  if (!report.ok) process.exitCode = 1;
}

if (require.main === module) main(process.argv.slice(2)).catch((error) => {
  process.stderr.write(error.message + '\n');
  process.exitCode = 1;
});

module.exports = { check };
