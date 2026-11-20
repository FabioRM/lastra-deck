'use strict';

{
  const CROP_SIZE = 128;
  function cropRect(width, height, zoom = 100, horizontal = 50, vertical = 50) {
    if (![width, height].every((side) => Number.isSafeInteger(side) && side > 0)
        || !Number.isFinite(zoom) || zoom < 100 || zoom > 400
        || ![horizontal, vertical].every((offset) => Number.isFinite(offset) && offset >= 0 && offset <= 100)) return null;
    const size = Math.max(1, Math.floor(Math.min(width, height) * 100 / zoom));
    return { x: Math.round((width - size) * horizontal / 100), y: Math.round((height - size) * vertical / 100), size };
  }

  const api = { CROP_SIZE, cropRect };
  if (typeof module === 'object') module.exports = api;
  else window.LastraAssetCrop = api;
}
