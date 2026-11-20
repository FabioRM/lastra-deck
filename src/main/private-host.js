// @ts-check
'use strict';

const net = require('node:net');

const LOCAL_NAMES = /(?:^|\.)(?:localhost|local|lan|home|internal|intranet|corp|home\.arpa)$/i;

function ipv4Private(address) {
  const [a, b] = address.split('.').map(Number);
  return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254)
    || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 198 && (b === 18 || b === 19)) || a >= 224;
}

/**
 * True for loopback, private, link-local and multicast addresses and for names that only resolve on a LAN.
 * A public name that resolves to a private address is not detected here.
 */
function isPrivateHost(hostname) {
  const host = String(hostname ?? '').replace(/^\[|\]$/g, '').replace(/\.$/, '').toLowerCase();
  if (!host || !host.includes('.') && !net.isIP(host)) return true;
  if (LOCAL_NAMES.test(host)) return true;
  if (net.isIPv4(host)) return ipv4Private(host);
  if (net.isIPv6(host)) {
    const mapped = host.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return ipv4Private(mapped[1]);
    return host === '::' || host === '::1' || /^f[cd]/.test(host) || /^fe[89ab]/.test(host) || /^ff/.test(host);
  }
  return false;
}

module.exports = { isPrivateHost };
