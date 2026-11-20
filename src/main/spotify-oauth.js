// @ts-check
'use strict';

const crypto = require('node:crypto');
const http = require('node:http');

const HOST = '127.0.0.1';
const PORT = 43821;
const CALLBACK = '/spotify/callback';
const AUTHORIZE = 'https://accounts.spotify.com/authorize';
const TOKEN = 'https://accounts.spotify.com/api/token';
const SCOPES = ['user-read-playback-state', 'user-read-currently-playing', 'user-modify-playback-state'];

function reply(res, status, message) {
  res.writeHead(status, {
    'Cache-Control': 'no-store',
    'Content-Type': 'text/plain; charset=utf-8',
    'Content-Security-Policy': "default-src 'none'",
    'Referrer-Policy': 'no-referrer',
    Connection: 'close',
  });
  res.end(message);
}

async function createAuthorization(clientId, { port = PORT, timeout = 120_000 } = {}) {
  const state = crypto.randomBytes(32).toString('base64url');
  const verifier = crypto.randomBytes(48).toString('base64url');
  let redirect;
  let settle;
  let settled = false;
  let timer;
  const result = new Promise((resolve) => { settle = resolve; });
  const finish = (outcome) => {
    if (settled) return;
    settled = true;
    clearTimeout(timer);
    server.close();
    settle(outcome);
  };

  const server = http.createServer({ requestTimeout: 5_000, headersTimeout: 5_000 }, (req, res) => {
    if (!redirect || req.headers.host !== redirect.host || !/^\/(?![/\\])/.test(req.url) || req.url.length > 4096) {
      return reply(res, 400, 'Invalid Spotify callback.');
    }
    const url = new URL(redirect.origin + req.url);
    if (req.method !== 'GET' || url.origin !== redirect.origin || url.pathname !== CALLBACK) {
      return reply(res, 404, 'Spotify callback unavailable.');
    }
    const returnedState = Buffer.from(url.searchParams.get('state') || '');
    const expectedState = Buffer.from(state);
    if (settled || url.searchParams.getAll('state').length !== 1 || returnedState.length !== expectedState.length ||
        !crypto.timingSafeEqual(returnedState, expectedState)) {
      return reply(res, 400, 'Invalid Spotify callback.');
    }
    const codes = url.searchParams.getAll('code');
    const errors = url.searchParams.getAll('error');
    if (errors.length === 1 && !codes.length) {
      reply(res, 200, 'Spotify authorization ended. You can return to Lastra.');
      return finish({ status: 'denied' });
    }
    if (codes.length !== 1 || errors.length || !/^[\x21-\x7e]{1,3072}$/.test(codes[0])) {
      return reply(res, 400, 'Invalid Spotify callback.');
    }
    reply(res, 200, 'Spotify callback received. Return to Lastra to check the connection.');
    finish({ status: 'received', code: codes[0] });
  });

  await /** @type {Promise<void>} */ (new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen({ host: HOST, port, exclusive: true }, resolve);
  }));
  server.unref();
  redirect = new URL(`http://${HOST}:${/** @type {import('node:net').AddressInfo} */ (server.address()).port}${CALLBACK}`);
  timer = setTimeout(() => finish({ status: 'expired' }), timeout);
  timer.unref();

  const url = new URL(AUTHORIZE);
  // URL#search stringifies the params object.
  url.search = /** @type {any} */ (new URLSearchParams({
    client_id: clientId,
    response_type: 'code',
    redirect_uri: redirect.href,
    scope: SCOPES.join(' '),
    state,
    code_challenge_method: 'S256',
    code_challenge: crypto.createHash('sha256').update(verifier).digest('base64url'),
  }));
  return { url: url.href, redirect: redirect.href, verifier, result, cancel: () => finish({ status: 'canceled' }) };
}

async function exchangeToken(fetcher, clientId, fields, signal) {
  const response = await fetcher(TOKEN, {
    method: 'POST', redirect: 'error',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: clientId, ...fields }),
    signal: AbortSignal.any([signal, AbortSignal.timeout(10_000)]),
  });
  const data = await response.json();
  if (!response.ok) {
    const error = /** @type {Error & { reauthorize?: boolean }} */ (new Error('Spotify did not issue a token.'));
    error.reauthorize = response.status === 400 && data?.error === 'invalid_grant';
    throw error;
  }
  return data;
}

module.exports = { createAuthorization, exchangeToken };
