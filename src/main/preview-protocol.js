// @ts-check
'use strict';

const path = require('node:path');
const { pathToFileURL } = require('node:url');

const SCHEME = 'lastra-preview';
const ASSET = /^\/src\/(?:renderer\/(?:index\.html|[a-z0-9-]+\.(?:css|js)|fonts\/[a-z0-9-]+\.woff2)|shared\/(?:appearance|decisions|dom|editing-keys|i18n(?:-it)?|key-readouts|linked-controls|sensor-binding|snippets|sounds|stats-chart|timers|widget-composition|widget-layout)\.js)$/;

function previewAssetPath(url, root) {
  const request = new URL(url);
  if (request.protocol !== `${SCHEME}:` || request.hostname !== 'deck' || request.port
      || request.username || request.password || !ASSET.test(request.pathname)) return null;
  return path.join(root, request.pathname.slice(1));
}

function declarePreviewScheme(protocol) {
  protocol.registerSchemesAsPrivileged([{ scheme: SCHEME, privileges: { standard: true, secure: true, corsEnabled: true } }]);
}

function servePreviewAssets(protocol, net, root) {
  protocol.handle(SCHEME, async (request) => {
    try {
      const file = request.method === 'GET' && previewAssetPath(request.url, root);
      if (file) {
        const response = await net.fetch(pathToFileURL(file).href);
        const headers = new Headers(response.headers);
        // The preview has an opaque origin. Fonts still need a CORS response.
        headers.set('Access-Control-Allow-Origin', '*');
        return new Response(response.body, { status: response.status, headers });
      }
    } catch {
      // Missing or invalid assets should only affect the preview.
    }
    return new Response(null, { status: 404 });
  });
}

module.exports = { declarePreviewScheme, servePreviewAssets, previewAssetPath };
