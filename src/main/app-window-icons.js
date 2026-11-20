// @ts-check
'use strict';

const CACHE_MS = 60_000;
const CACHE_LIMIT = 64;

function iconUrl(image) {
  try {
    if (!image || image.isEmpty()) return null;
    const icon = image.resize({ width: 32, height: 32 });
    if (icon.isEmpty()) return null;
    return icon.toDataURL();
  } catch {
    return null;
  }
}

function createAppWindowIcons({ getSources, getFileIcon, now = Date.now }) {
  const cache = new Map();
  let currentRead;

  function windows() {
    // Ask for icons only. A zero-sized thumbnail skips capture of window content.
    currentRead ??= Promise.resolve().then(() => getSources({
      types: ['window'], thumbnailSize: { width: 0, height: 0 }, fetchWindowIcons: true,
    })).then((sources) => {
      const images = new Map();
      for (const source of sources) {
        const handle = /^window:(\d+):0$/.exec(source.id)?.[1];
        if (handle && source.appIcon) images.set(handle, source.appIcon);
      }
      return images;
    }).catch(() => new Map()).finally(() => { currentRead = undefined; });
    return currentRead;
  }

  return async (entries) => {
    const timestamp = now();
    const files = new Map();
    let windowImages;
    async function load(entry) {
      windowImages ??= windows();
      const handle = entry.id.split(':')[1];
      const image = iconUrl((await windowImages).get(handle));
      if (image || !entry.path) return image;
      if (!files.has(entry.path)) {
        files.set(entry.path, Promise.resolve().then(() => getFileIcon(entry.path, { size: 'small' }))
          .then(iconUrl).catch(() => null));
      }
      return files.get(entry.path);
    }

    const icons = entries.map(async (entry) => {
      let stored = cache.get(entry.id);
      if (!stored || stored.path !== entry.path || stored.expires <= timestamp) {
        stored = { path: entry.path, expires: timestamp + CACHE_MS, image: load(entry) };
        cache.delete(entry.id);
        cache.set(entry.id, stored);
      }
      return [entry.id, await stored.image];
    });
    while (cache.size > CACHE_LIMIT) cache.delete(cache.keys().next().value);
    return new Map(await Promise.all(icons));
  };
}

module.exports = { createAppWindowIcons };
