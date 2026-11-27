import * as THREE from '../../node_modules/three/build/three.module.js';
import { waterLit } from './aquarium-materials.mjs';

export const MAX_FOOD = 96;
const TYPES = {
  flakes: { speed: .54, size: .102, spread: 1.05, colours: ['#f2b957', '#ce7e52', '#f5d691'] },
  pellets: { speed: .79, size: .080, spread: .64, colours: ['#efa349', '#ac6744', '#e3aa60'] },
  wafers: { speed: 1.54, size: .132, spread: .57, colours: ['#a4994b', '#b78a4c', '#cdad6b'] },
};

export function createFoodSimulation({ random, floor, flow = .55 }) {
  const particles = [];
  let sequence = 0;
  let cooldown = 0;
  let linger = 0;
  return {
    particles,
    active: () => particles.length > 0 || linger > 0,
    drop(x, z, height, type, portion) {
      if (cooldown > 0 || particles.length >= MAX_FOOD || !Object.hasOwn(TYPES, type)) return false;
      const profile = TYPES[type];
      const quantity = Math.min(MAX_FOOD - particles.length, [0, 13, 23, 34][portion] ?? 23);
      for (let i = 0; i < quantity; i++) {
        const angle = random() * Math.PI * 2;
        const spread = Math.sqrt(random()) * profile.spread;
        const size = profile.size * (.65 + random() * .76);
        const px = x + Math.cos(angle) * spread, pz = z + Math.sin(angle) * spread;
        particles.push({ id: ++sequence, x: px, y: height + random() * .45,
          z: pz, bed: floor(px,pz), age: -random() * .44, delay: type === 'flakes' ? .44 + random() * 1.15 : .12,
          speed: profile.speed * (.62 + random() * .71), phase: random() * 6.28, size, type,
          color: profile.colours[i % profile.colours.length], grounded: false, eaten: false });
      }
      cooldown = .38;
      return true;
    },
    step(delta) {
      cooldown = Math.max(0, cooldown - delta);
      linger = Math.max(0, linger - delta);
      for (let i = particles.length - 1; i >= 0; i--) {
        const piece = particles[i];
        piece.age += delta;
        if (piece.eaten || piece.age > 21) {
          particles.splice(i, 1);
          continue;
        }
        if (piece.age < 0 || piece.grounded) continue;
        const rock = piece.bed + piece.size * .40;
        piece.y = Math.max(rock, piece.y - delta * piece.speed * (piece.age < piece.delay ? .13 : 1));
        piece.grounded = piece.y <= rock + .001;
        if (!piece.grounded) {
          piece.x += delta * (.23 * flow + Math.sin(piece.age * 2.8 + piece.phase) * (.14 + .24 * flow));
          piece.z += delta * Math.cos(piece.age * 1.67 + piece.phase) * (.12 + .11 * flow);
          piece.bed = floor(piece.x, piece.z);
        }
      }
    },
    find(origin, mode, radius, preference = 0, available) {
      let closest;
      let score = radius * radius;
      for (const piece of particles) {
        if (piece.eaten || piece.age < 0) continue;
        const aboveBed = piece.y - piece.bed;
        if (mode === 'bed' && aboveBed > .58) continue;
        if (mode === 'swimmer' && (piece.grounded || aboveBed < .62)) continue;
        if (mode === 'sifter' && (piece.type === 'wafers' || aboveBed > 1.2)) continue;
        const dx = origin.x - piece.x, dy = origin.y - piece.y, dz = origin.z - piece.z;
        const distance = dx * dx + dy * dy * (mode === 'bed' ? .37 : 1) + dz * dz;
        const biased = distance * (.88 + ((piece.id + preference) % 7) * .038);
        if (biased < score && (!available || available(piece))) {
          closest = piece;
          score = biased;
        }
      }
      return closest;
    },
    consume(piece, mouth, radius) {
      if (!piece || piece.eaten || piece.age < 0
        || Math.hypot(piece.x - mouth.x, piece.y - mouth.y, piece.z - mouth.z) > radius) return false;
      piece.eaten = true;
      linger = .72;
      return true;
    },
  };
}

export function makeFood(scene, resources, uniforms, simulation) {
  const geometry = resources.keep(new THREE.DodecahedronGeometry(1, 0));
  const material = waterLit(resources, uniforms, { color: '#ffffff', roughness: .82, emissive: '#a47740', emissiveIntensity: .19 });
  const grains = new THREE.InstancedMesh(geometry, material, MAX_FOOD);
  grains.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  grains.count = 0;
  grains.frustumCulled = false;
  scene.add(grains);
  const shape = new THREE.Object3D();
  const color = new THREE.Color();
  return () => {
    let index = 0;
    for (const piece of simulation.particles) {
      if (piece.eaten || piece.age < 0) continue;
      const size = piece.size * (piece.grounded ? .87 : 1);
      const thickness = piece.type === 'pellets' ? .78 : .25;
      shape.position.set(piece.x, piece.y, piece.z);
      shape.rotation.set(piece.grounded ? 0 : piece.phase + piece.age * 1.7, piece.phase * 2.1, piece.grounded ? 0 : piece.age + piece.phase);
      shape.scale.set(size, size * thickness, size * .72);
      shape.updateMatrix();
      grains.setMatrixAt(index, shape.matrix);
      grains.setColorAt(index, color.set(piece.color));
      index++;
    }
    const changed = index || grains.count;
    grains.count = index;
    if (changed) {
      grains.instanceMatrix.needsUpdate = true;
      grains.instanceColor.needsUpdate = true;
    }
  };
}
