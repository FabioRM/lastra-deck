import * as THREE from '../../node_modules/three/build/three.module.js';

async function loadBoulderGeometry(resources) {
  try {
    const { boulderGeometry } = await import('./aquarium-textures/boulder-geometry.mjs');
    const compressed = Uint8Array.from(atob(boulderGeometry), (byte) => byte.charCodeAt(0));
    const stream = new Blob([compressed]).stream().pipeThrough(new DecompressionStream('gzip'));
    const data = await new Response(stream).arrayBuffer();
    const [vertices, indices] = new Uint32Array(data,0,2);
    if (!vertices || !indices || 8 + vertices*32 + indices*2 !== data.byteLength) return null;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position',new THREE.BufferAttribute(new Float32Array(data,8,vertices*3),3));
    geometry.setAttribute('normal',new THREE.BufferAttribute(new Float32Array(data,8+vertices*12,vertices*3),3));
    geometry.setAttribute('uv',new THREE.BufferAttribute(new Float32Array(data,8+vertices*24,vertices*2),2));
    geometry.setIndex(new THREE.BufferAttribute(new Uint16Array(data,8+vertices*32,indices),1));
    return resources.keep(geometry);
  } catch {
    return null;
  }
}

export async function loadAquariumTextures(resources, quality) {
  const loader = new THREE.TextureLoader();
  async function load(name, colour, repeat = [1, 1], flipY = true) {
    try {
      const texture = await loader.loadAsync(new URL(`./aquarium-textures/${name}.webp`, import.meta.url).href);
      texture.colorSpace = colour ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
      texture.repeat.set(...repeat);
      texture.flipY = flipY;
      texture.anisotropy = quality === 'high' ? 8 : 4;
      return resources.keep(texture);
    } catch {
      return null;
    }
  }
  const [rock, sand, sandNormal, boulderMap, boulderGeometry] = await Promise.all([
    load('rock-albedo', true), load('sand-albedo', true, [21, 16]),
    quality === 'eco' ? null : load('sand-normal', false, [21, 16]),
    load('boulder-albedo', true, [1,1], false), loadBoulderGeometry(resources),
  ]);
  return { rock, sand, sandNormal, boulderMap, boulderGeometry };
}
