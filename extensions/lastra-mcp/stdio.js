// @ts-check
'use strict';

const fs = require('node:fs');
const { connectAgent } = require('../../src/main/mcp-client');
const { offlineLayout } = require('../../src/main/mcp-layout');
const { simulateGesture } = require('../../src/main/mcp-simulate');
const { searchCatalog } = require('../../src/main/mcp-catalog-search');
const { composeMacro } = require('../../src/main/mcp-macros');
const { previewImageContent } = require('../../src/main/mcp-visual-preview');
const { PROMPTS, promptResult } = require('../../src/main/mcp-prompts');
const { readFrames, writeFrame } = require('../../src/main/mcp-link');
const { CATALOG_VERSION, PROTOCOLS, LIVE_OPERATIONS, TOOLS, RESOURCES, RESOURCE_TEMPLATES, REFERENCE,
  paginate } = require('../../src/main/mcp-catalog');

const NAME = 'lastra';
const { version: VERSION } = require('../../package.json');

function resourceParameters(uri) {
  if (typeof uri !== 'string' || uri.length > 1024) return null;
  const parsed = new URL(uri);
  if (parsed.protocol !== 'lastra:' || parsed.hostname !== 'v1' || parsed.username || parsed.password || parsed.port || parsed.hash) return null;
  if (parsed.pathname === '/deck/providers' && !parsed.search) return { tool: 'provider_status' };
  if (!['/deck/profile', '/deck/events'].includes(parsed.pathname)) return null;
  const args = Object.create(null);
  for (const [key, value] of parsed.searchParams) {
    if (Object.hasOwn(args, key)) throw new Error('Use one value per resource option.');
    args[key] = key === 'limit' ? Number(value) : key === 'types' ? value.split(',') : value;
  }
  return { tool: parsed.pathname === '/deck/profile' ? 'profile_snapshot' : 'events_since', args };
}

function createSession({ credential, connect = connectAgent, send }) {
  let protocol;
  let link;
  const subscriptions = new Map();
  const error = (id, code, message) => send({ jsonrpc: '2.0', id, error: { code, message } });
  // A result that cannot be framed (for example one over the size limit) becomes a JSON-RPC error
  // for that request, so one oversized answer never ends the whole session.
  const reply = (id, result) => {
    try { return send({ jsonrpc: '2.0', id, result }); }
    catch (problem) { return error(id, -32603, problem.message); }
  };

  /**
   * @param {unknown} value
   * @param {boolean} [isError]
   * @returns {{ content: Array<Record<string, any>>, isError?: boolean, structuredContent?: unknown }}
   */
  function content(value, isError = false) {
    return { content: [{ type: 'text', text: JSON.stringify(value) }],
      ...(isError ? { isError } : protocol === PROTOCOLS[0] ? { structuredContent: value } : {}) };
  }

  async function liveRead(name, args) {
    if (!link || link.disconnected) {
      subscriptions.clear();
      link = await connect(credential, { onNotice(subscription) {
        const uri = subscriptions.get(subscription);
        if (uri) send({ jsonrpc: '2.0', method: 'notifications/resources/updated', params: { uri } });
      } });
    }
    return link.call(name, args);
  }

  async function capabilities() {
    let available = [];
    const source = 'Local Windows connection';
    let connection = { source, status: 'unavailable', reason: 'There is no agent credential.' };
    if (credential) {
      try {
        const result = await liveRead('connection');
        if (!result.ok) throw new Error(result.message);
        available = Array.isArray(result.data?.available) ? result.data.available : ['connection'];
        connection = { source, status: 'connected', reason: 'Lastra authenticated the client.' };
      } catch (problem) {
        connection = { source, status: 'unavailable', reason: problem.message };
      }
    }
    // Schemas are published once by tools/list; repeating them here pushed the reply past the frame limit.
    return { version: CATALOG_VERSION, connection, tools: TOOLS.map(({ inputSchema, outputSchema, ...entry }) => {
      const operation = Object.hasOwn(LIVE_OPERATIONS, entry.name) ? LIVE_OPERATIONS[entry.name] : null;
      const status = operation ? (available.includes(entry.name) ? 'connected' : 'unavailable')
        : entry.name === 'capabilities' ? 'connected' : 'simulated';
      return {
        ...entry, effect: operation?.effect ?? 'Read', status,
        permission: operation?.allScopes ? [operation.scope, ...operation.allScopes].filter(Boolean).join(' and ')
          : operation?.scope ?? operation?.anyScopes?.join(' or ') ?? (operation ? 'agent credential' : 'none'),
        prerequisite: operation ? 'Running Windows instance with an active client grant' : 'Local stdio server',
        reason: status === 'unavailable' ? (connection.status === 'connected' ? 'The scope or activity is unavailable.' : connection.reason)
          : entry.name === 'search_catalog' ? 'Uses the bundled offline catalogs.'
            : entry.name === 'compose_macro' ? 'Validates the supplied macro without running it.'
              : entry.name === 'simulate_gesture' ? 'Uses fixture input, foreground windows, and provider events.'
                : status === 'simulated' ? 'Uses the supplied profile and sample positions.' : 'Ready.',
        platforms: operation ? ['Windows'] : ['local Node.js'],
      };
    }) };
  }

  async function tool(name, args) {
    const entry = TOOLS.find((item) => item.name === name);
    if (!entry) return content({ message: 'Unknown Lastra tool.' }, true);
    if (args === null || typeof args !== 'object' || Array.isArray(args)
        || Object.keys(args).some((key) => !Object.hasOwn(entry.inputSchema.properties, key))) {
      return content({ message: 'Use the parameters described by the tool schema.' }, true);
    }
    if (name === 'capabilities') return content(await capabilities());
    if (name === 'simulate_gesture') {
      try { return content(await simulateGesture(args)); }
      catch (problem) { return content({ message: problem.message }, true); }
    }
    if (name === 'search_catalog') {
      try { return content(searchCatalog(args)); }
      catch (problem) { return content({ message: problem.message }, true); }
    }
    if (name === 'compose_macro') {
      try { return content(composeMacro(args)); }
      catch (problem) { return content({ message: problem.message }, true); }
    }
    if (name === 'preview_profile' || name === 'validate_profile') {
      try {
        if ((args.page !== undefined && typeof args.page !== 'string') || (args.portrait !== undefined && typeof args.portrait !== 'boolean')) {
          throw new Error('Choose a page ID and a landscape or portrait layout.');
        }
        const layout = offlineLayout(args.profile, args);
        return content(name === 'preview_profile' ? layout : { valid: true });
      } catch (problem) {
        return content({ valid: false, message: problem.message }, true);
      }
    }
    try {
      const result = await liveRead(name, args);
      if (!result.ok) return content({ message: result.message }, true);
      if (name !== 'preview_draft') return content(result.data);
      const { summary, image } = previewImageContent(result.data);
      const packet = content(summary);
      packet.content.push(image);
      return packet;
    } catch (problem) {
      return content({ status: 'unavailable', message: problem.message }, true);
    }
  }

  return {
    close() { link?.close(); },
    async receive(request) {
      const { jsonrpc, id, method, params } = request;
      if (jsonrpc !== '2.0' || typeof method !== 'string') return error(null, -32600, 'Invalid request.');
      if (id === undefined) return;
      if (typeof id !== 'string' && !Number.isSafeInteger(id)) return error(null, -32600, 'Invalid request ID.');
      if (method === 'initialize') {
        const requested = params?.protocolVersion;
        protocol = PROTOCOLS.includes(requested) ? requested : PROTOCOLS[0];
        return reply(id, { protocolVersion: protocol,
          capabilities: { tools: {}, resources: { subscribe: true }, prompts: {} }, serverInfo: { name: NAME, version: VERSION } });
      }
      if (method === 'ping') return reply(id, {});
      if (!protocol) return error(id, -32002, 'Initialize the Lastra server first.');
      const collections = {
        'tools/list': ['tools', TOOLS.map(({ example, ...entry }) => {
          if (protocol !== PROTOCOLS[0]) delete entry.outputSchema;
          return entry;
        })],
        'resources/list': ['resources', RESOURCES],
        'prompts/list': ['prompts', PROMPTS],
      };
      if (Object.hasOwn(collections, method)) {
        try { return reply(id, paginate(...collections[method], params?.cursor)); }
        catch (problem) { return error(id, -32602, problem.message); }
      }
      if (method === 'tools/call' && typeof params?.name === 'string') return reply(id, await tool(params.name, params.arguments ?? {}));
      if (method === 'resources/templates/list') {
        try { return reply(id, paginate('resourceTemplates', RESOURCE_TEMPLATES, params?.cursor)); }
        catch (problem) { return error(id, -32602, problem.message); }
      }
      if (method === 'resources/subscribe' || method === 'resources/unsubscribe') {
        let resource;
        try { resource = resourceParameters(params?.uri); }
        catch { return error(id, -32602, 'Invalid Lastra resource URI.'); }
        if (resource?.tool !== 'events_since') return error(id, -32002, 'This resource has no subscriptions.');
        const existing = [...subscriptions].find(([, uri]) => uri === params.uri)?.[0];
        try {
          if (method === 'resources/subscribe' && (!existing || link?.disconnected)) {
            const result = await liveRead('event_subscribe', resource.args);
            if (!result.ok) return error(id, -32002, result.message);
            subscriptions.set(result.data.subscription, params.uri);
          } else if (method === 'resources/unsubscribe' && existing) {
            subscriptions.delete(existing);
            if (link && !link.disconnected) await liveRead('event_unsubscribe', { subscription: existing });
          }
          return reply(id, {});
        } catch {
          return error(id, -32002, 'The local Lastra connection is unavailable.');
        }
      }
      if (method === 'resources/read') {
        const resource = RESOURCES.find(({ uri }) => uri === params?.uri);
        let value;
        if (resource?.uri === 'lastra://v1/capabilities') value = await capabilities();
        else if (resource?.uri === 'lastra://v1/profile/example') value = TOOLS.find(({ name }) => name === 'preview_profile').example.profile;
        else if (resource?.uri === 'lastra://v1/reference') value = { version: CATALOG_VERSION, paths: REFERENCE };
        else {
          let live;
          try { live = resourceParameters(params?.uri); }
          catch { return error(id, -32602, 'Invalid Lastra resource URI.'); }
          if (!live) return error(id, -32002, 'Resource unavailable.');
          const result = await tool(live.tool, live.args ?? {});
          if (result.isError) return error(id, -32002, 'The Lastra resource or its grant is unavailable.');
          value = JSON.parse(result.content[0].text);
        }
        return reply(id, { contents: [{ uri: params.uri, mimeType: 'application/json', text: JSON.stringify(value) }] });
      }
      if (method === 'prompts/get') {
        try {
          const result = promptResult(params?.name, params?.arguments);
          return result ? reply(id, result) : error(id, -32602, 'Prompt unavailable.');
        } catch (problem) { return error(id, -32602, problem.message); }
      }
      return error(id, -32601, 'Method unavailable.');
    },
  };
}

function serve(credential) {
  const server = createSession({ credential, send: (packet) => writeFrame(process.stdout, packet) });
  let pending = Promise.resolve();
  let count = 0;
  let closed = false;
  const stop = () => { closed = true; server.close(); process.stdin.pause(); };
  process.stdout.on('error', stop);
  process.stdin.on('error', stop);
  process.stdin.once('end', () => { void pending.finally(stop); });
  readFrames(process.stdin, (request) => {
    if (closed) return;
    if (count >= 16) {
      if (typeof request.id === 'string' || Number.isSafeInteger(request.id)) {
        writeFrame(process.stdout, { jsonrpc: '2.0', id: request.id, error: { code: -32000, message: 'Too many outstanding requests.' } });
      }
      return;
    }
    count++;
    pending = pending.then(() => closed ? undefined : server.receive(request)).catch((problem) => {
      process.stderr.write(`Lastra MCP session stopped: ${problem?.message ?? problem}\n`);
      stop();
    }).finally(() => { count--; });
  }, () => {
    writeFrame(process.stdout, { jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Invalid MCP message.' } });
    stop();
  });
  process.stdin.resume();
}

/**
 * @param {string[]} argv
 * @param {string | undefined} credential
 */
async function run([mode, file], credential) {
  if (!mode) return serve(credential);
  if (mode === '--check') {
    const link = await connectAgent(credential);
    try { writeFrame(process.stdout, await link.call('connection')); } finally { link.close(); }
    return;
  }
  if (!['--validate', '--preview'].includes(mode) || !file) throw new Error('Use --check, --validate PROFILE, or --preview PROFILE.');
  const raw = JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
  const layout = offlineLayout(raw);
  writeFrame(process.stdout, mode === '--preview' ? layout : { valid: true });
}

if (require.main === module) {
  run(process.argv.slice(2), process.env.LASTRA_AGENT_CREDENTIAL).catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

module.exports = { createSession };
