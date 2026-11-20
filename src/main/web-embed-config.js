// @ts-check
'use strict';

function httpsUrl(value) {
  let url;
  try { url = typeof value === 'string' && value.length <= 2_048 ? new URL(value) : null; } catch { /* Report the common validation error. */ }
  if (!url || url.protocol !== 'https:' || url.username || url.password) {
    throw new Error('Enter an HTTPS URL without credentials');
  }
  return url;
}

function spotify(url) {
  const match = /^\/(?:intl-[a-z-]+\/)?(?:embed\/)?(playlist|episode|album|track|show)\/([a-z\d]{22})\/?$/i.exec(url.pathname);
  if (url.origin !== 'https://open.spotify.com' || !match) throw new Error('Enter a supported open.spotify.com link');
  const [, type, id] = match;
  return { url: `https://open.spotify.com/embed/${type.toLowerCase()}/${id}`, external: `https://open.spotify.com/${type.toLowerCase()}/${id}` };
}

function normalizeEntry(raw) {
  if (!raw || typeof raw !== 'object' || Object.keys(raw).some((key) => !['id', 'name', 'kind', 'url'].includes(key))) {
    throw new Error('Use id, name, kind, and url for each entry');
  }
  const { id, name, kind } = raw;
  if (typeof id !== 'string' || !/^[a-z0-9][a-z0-9_-]{0,47}$/.test(id)) throw new Error('Choose a lowercase embed ID');
  if (typeof name !== 'string' || !name.trim() || name.length > 80 || /[\u0000-\u001f\u007f]/.test(name)) {
    throw new Error('Enter an embed name of 1 to 80 characters');
  }
  if (!['web', 'spotify'].includes(kind)) throw new Error('Choose web or spotify');
  const url = httpsUrl(raw.url);
  return { id, name: name.trim(), kind, ...(kind === 'spotify' ? spotify(url) : { url: url.href, external: url.href }) };
}

function normalizeEmbeds(config) {
  if (config?.version !== 1 || !Array.isArray(config.embeds) || config.embeds.length > 24) {
    throw new Error('Web embeds require version 1 and a list of up to 24 entries');
  }
  const ids = new Set();
  return config.embeds.map((raw, index) => {
    try {
      const entry = normalizeEntry(raw);
      if (ids.has(entry.id)) throw new Error('Choose a unique embed ID');
      ids.add(entry.id);
      return entry;
    } catch (err) {
      throw new Error(`Embed ${index + 1}. ${err.message}`);
    }
  });
}

function allowedNavigation(start, target) {
  try {
    return httpsUrl(start).origin === httpsUrl(target).origin;
  } catch {
    return false;
  }
}

function allowsEmbedding(headers = {}) {
  for (const [name, values] of Object.entries(headers)) {
    if (name.toLowerCase() === 'x-frame-options' && values.some((value) => /\b(?:deny|sameorigin)\b/i.test(value))) return false;
    if (name.toLowerCase() !== 'content-security-policy') continue;
    for (const policy of values.flatMap((value) => value.split(','))) {
      const directive = policy.split(';').map((entry) => entry.trim()).find((entry) => /^frame-ancestors(?:\s|$)/i.test(entry));
      if (directive && !directive.split(/\s+/).slice(1).some((source) => source === '*' || source.toLowerCase() === 'file:')) return false;
    }
  }
  return true;
}

module.exports = { normalizeEmbeds, normalizeEntry, allowedNavigation, allowsEmbedding };
