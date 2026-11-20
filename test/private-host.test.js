'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { isPrivateHost } = require('../src/main/private-host');

test('loopback, private, link-local and LAN-only hosts are private', () => {
  for (const host of ['localhost', 'app.localhost', '127.0.0.1', '10.1.2.3', '172.20.0.1', '192.168.1.10', '169.254.1.1',
    '100.64.0.1', '0.0.0.0', '::1', '[::1]', 'fd00::1', 'fe80::1', '::ffff:192.168.0.1', 'nas.local', 'router.lan',
    'printer', 'home.arpa', 'svc.internal', '224.0.0.1']) {
    assert.equal(isPrivateHost(host), true, host);
  }
});

test('public names and addresses are not private', () => {
  for (const host of ['open.spotify.com', 'example.com', '8.8.8.8', '172.32.0.1', '2606:4700::1111', 'test.invalid']) {
    assert.equal(isPrivateHost(host), false, host);
  }
});
