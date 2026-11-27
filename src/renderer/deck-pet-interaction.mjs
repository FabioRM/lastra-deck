import * as THREE from '../../node_modules/three/build/three.module.js';
import { easeInOut, pulse } from './deck-pet-animals.mjs';

const HOME = { x: .25, z: .57 };
const FEATURES = {
  grove: { x: -1.32, z: .66, height: .88, width: .32, form: 'light' },
  moon: { x: -1.75, z: .55, height: .76, width: .39, form: 'spark' },
  tide: { x: -1.18, z: .68, height: .19, width: .51, form: 'water' },
  aurora: { x: -1.71, z: .52, height: .69, width: .37, form: 'spark' },
  oasis: { x: -1.03, z: .72, height: .19, width: .56, form: 'water' },
  orbit: { x: 1.76, z: -.76, height: .60, width: .33, form: 'scan' },
  neon: { x: 1.49, z: .60, height: .70, width: .34, form: 'scan' },
  cyber: { x: -1.53, z: .67, height: .80, width: .37, form: 'light' },
};

function ring(model, scene, color, opacity) {
  const material = model.track(new THREE.MeshBasicMaterial({ color, opacity, transparent: true, depthWrite: false }));
  const object = model.mesh(scene, 'ring', material, [0, .057, 0], [1, 1, 1]);
  object.rotation.x = -Math.PI / 2;
  return object;
}

function makeFeatureEffects(model, scene, feature, theme) {
  const { mesh, radial } = model;
  const target = ring(model, scene, theme.light, .58);
  target.position.set(feature.x, .065, feature.z);
  const spot = mesh(scene, 'disc', radial('world interaction', theme.accent, .46, true),
    [feature.x, feature.height * .54 + .13, feature.z + .23], [.62, .62, 1]);
  const wave = ring(model, scene, theme.light, .57);
  const sparks = Array.from({ length: 12 }, (_, index) => mesh(scene, feature.form === 'water' ? 'ball' : 'facet',
    index % 2 ? theme.accent : theme.light, [0, 0, 0], [1, 1, 1], 'glow'));

  return (time, age, camera) => {
    const ping = .5 + Math.sin(time * 2.2) * .5;
    const burst = age >= 0 && age < 1.45;
    const intensity = burst ? pulse(age, 0, .33, 1.45) : 0;
    const radius = feature.width * (1.13 + ping * .08);
    target.scale.set(radius, radius * .92, 1.1);
    target.material.opacity = .48 + .17 * ping + intensity * .25;
    spot.quaternion.copy(camera.quaternion);
    spot.material.opacity = .12 + intensity * .59;
    spot.scale.setScalar(.42 + intensity * .62);
    wave.visible = burst;
    if (burst) {
      const spread = feature.width + age * .61;
      wave.position.set(feature.x, feature.form === 'scan' ? .17 + age * .55 : .07, feature.z);
      wave.scale.set(spread, spread * .9, .76);
      wave.material.opacity = (1 - age / 1.45) * .75;
    }
    for (const [index, spark] of sparks.entries()) {
      const rise = age - (index % 4) * .09;
      spark.visible = burst && rise > 0 && rise < 1.1;
      if (!spark.visible) continue;
      const angle = index * 2.399 + rise * 2.6;
      const radius = (feature.form === 'scan' ? .31 : .11 + rise * .48) + (index % 3) * .038;
      const tall = feature.form === 'water' ? Math.sin(rise * Math.PI) * .54 : rise * .92 + .11;
      spark.position.set(feature.x + Math.cos(angle) * radius, .15 + tall + feature.height * .40, feature.z + Math.sin(angle) * radius);
      const size = (.036 + index % 3 * .013) * pulse(rise, 0, .24, 1.10);
      spark.scale.set(size, size * (feature.form === 'spark' ? 2.1 : 1), size);
      spark.rotation.set(rise, angle, index);
    }
  };
}

export function makeWorldInteraction(model, scene, habitat, theme) {
  const feature = FEATURES[habitat];
  const effects = makeFeatureEffects(model, scene, feature, theme);
  const terrainPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const intersection = new THREE.Vector3();
  const itemHit = new THREE.Box3(new THREE.Vector3(feature.x - feature.width, -.03, feature.z - feature.width),
    new THREE.Vector3(feature.x + feature.width, feature.height + .05, feature.z + feature.width));
  const petHits = [];
  const marker = ring(model, scene, theme.light, .55);
  const approach = { x: feature.x * .61, z: Math.max(.21, feature.z + .18) };
  let x = HOME.x;
  let z = HOME.z;
  let trip;
  let featureAt = -Infinity;
  let nextAutonomous = 15;

  function pick(relativeX, relativeY, camera, pet) {
    pointer.set(relativeX * 2 - 1, 1 - relativeY * 2);
    raycaster.setFromCamera(pointer, camera);
    petHits.length = 0;
    raycaster.intersectObject(pet.root, true, petHits);
    const object = raycaster.ray.intersectBox(itemHit, intersection);
    if (petHits.length && (!object || petHits[0].distance < raycaster.ray.origin.distanceTo(object))) return { action: 'pet' };
    if (object) return { action: 'explore' };
    const ground = raycaster.ray.intersectPlane(terrainPlane, intersection);
    return ground && Math.hypot(ground.x, ground.z / .78) < 2.55 ? { point: { x: ground.x, z: ground.z } } : null;
  }

  function walk(point, seconds, motion, exploring = false) {
    const destX = THREE.MathUtils.clamp(point.x, -1.45, 1.45);
    const destZ = THREE.MathUtils.clamp(point.z, .21, 1.17);
    const distance = Math.hypot(destX - x, destZ - z);
    const duration = THREE.MathUtils.clamp(distance * .63, .45, 1.36);
    if (motion) {
      trip = { at: seconds, duration, fromX: x, fromZ: z, toX: destX, toZ: destZ, exploring };
      if (exploring) featureAt = seconds + duration * .86;
    } else {
      x = destX;
      z = destZ;
      trip = undefined;
    }
  }

  function explore(seconds, motion) {
    walk(approach, seconds, motion, true);
  }

  function stop() { trip = undefined; }

  function update(seconds, time, busy, sleeping, motion, camera) {
    if (busy || sleeping || trip) nextAutonomous = Math.max(nextAutonomous, time + 18);
    if (motion && !busy && !sleeping && !trip && time >= nextAutonomous) {
      if (Math.hypot(x - approach.x, z - approach.z) < .18) walk(HOME, seconds, true);
      else explore(seconds, true);
      nextAutonomous = time + 28;
    }
    let walking = 0;
    let turn = 0;
    let arrival = 0;
    marker.visible = false;
    if (trip && motion && !sleeping) {
      const age = seconds - trip.at;
      const progress = easeInOut(age, 0, trip.duration);
      x = THREE.MathUtils.lerp(trip.fromX, trip.toX, progress);
      z = THREE.MathUtils.lerp(trip.fromZ, trip.toZ, progress);
      walking = pulse(age, 0, trip.duration * .38, trip.duration + .12);
      turn = THREE.MathUtils.clamp((trip.toX - trip.fromX) * 1.3, -1.30, 1.16) * walking;
      arrival = trip.exploring ? pulse(age, trip.duration * .85, trip.duration + .16, trip.duration + .75) : 0;
      if (!trip.exploring && age < .63) {
        marker.visible = true;
        marker.position.set(trip.toX, .06, trip.toZ);
        const scale = .09 + age * .45;
        marker.scale.set(scale, scale, .7);
        marker.material.opacity = .67 * (1 - age / .63);
      }
      if (age >= trip.duration + .75) trip = undefined;
    }
    effects(time, motion ? seconds - featureAt : -1, camera);
    return { x, z, walking, turn, arriving: arrival, sleeping };
  }

  return { pick, walk, explore, stop, update };
}
