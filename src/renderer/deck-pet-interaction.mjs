import * as THREE from '../../node_modules/three/build/three.module.js';
import { easeInOut, pulse } from './deck-pet-animals.mjs';
import { chooseActivity, clipLength, FEATURE_CLIPS, shuffleClips } from './deck-pet-behavior.mjs';

const HOME = { x: .25, z: .57 };
const PRIMARY = {
  grove: [-1.32, .66, .88, .33, 'light'],
  moon: [-1.75, .55, .82, .43, 'spark'],
  tide: [-1.18, .68, .22, .54, 'water'],
  aurora: [-1.71, .52, .79, .41, 'spark'],
  oasis: [-1.03, .72, .21, .57, 'water'],
  orbit: [1.76, -.76, .66, .38, 'scan'],
  neon: [1.49, .60, .72, .36, 'scan'],
  cyber: [-1.53, .67, .81, .40, 'light'],
};
const LANDMARKS = {
  grove: ['Glowcaps', 'flower', '#f3ad79'],
  moon: ['Night blossoms', 'flower', '#ed9cdb'],
  tide: ['Singing shell', 'shell', '#f4b6b9'],
  aurora: ['Snowdrift', 'snow', '#d0e9ff'],
  oasis: ['Desert bloom', 'flower', '#ffa974'],
  orbit: ['Meteor fragment', 'spark', '#ceb9ff'],
  neon: ['Hologram', 'scan', '#7bf4ff'],
  cyber: ['Luminous sprout', 'flower', '#9fffbc'],
};

function featureLayout(habitat, layout) {
  const [px, z, height, width, form] = PRIMARY[habitat];
  const [label, kind, color] = LANDMARKS[habitat];
  const sign = Math.sign(px);
  const primary = { id: 'primary', x: px * layout.scenery, z, height, width: width * layout.scenery, form };
  const landmark = { id: 'landmark', x: -sign * layout.rx * .65, z: .74, height: kind === 'scan' ? .79 : .48,
    width: .40, form: kind, color, label };
  const bed = { id: 'bed', x: sign * layout.rx * .73, z: 1.02, height: .24, width: .49,
    form: 'rest', color: '#9fbbe5', label: 'Rest spot' };
  if (Math.hypot(primary.x - bed.x, primary.z - bed.z) < 1.05) {
    bed.z = -bed.z * .36;
    bed.x = -bed.x;
  }
  return [primary, landmark, bed];
}

function ring(model, scene, color, opacity) {
  const material = model.track(new THREE.MeshBasicMaterial({ color, opacity, transparent: true, depthWrite: false }));
  const object = model.mesh(scene, 'ring', material, [0, .057, 0], [1, 1, 1]);
  object.rotation.x = -Math.PI / 2;
  return object;
}

function sculptLandmark(model, scene, feature, theme) {
  const { mesh, group } = model;
  const { x, z, form, color } = feature;
  const base = group(scene, x, 0, z);
  if (form === 'rest') {
    mesh(base, 'ball', theme.rim, [0, .068, 0], [.49, .089, .36]);
    mesh(base, 'ball', color, [0, .127, 0], [.39, .096, .28]);
    mesh(base, 'ball', theme.light, [-.21, .17, -.064], [.17, .061, .16]);
  } else if (form === 'snow' || form === 'shell') {
    for (const [offset, y, size] of [[-.16, .07, .26], [.03, .15, .30], [.21, .055, .22]]) {
      const piece = mesh(base, form === 'snow' ? 'foliage' : 'ball', color, [offset, y, 0], [size, size * .59, size * .74], 'facet');
      piece.rotation.y = offset * 4;
    }
    if (form === 'shell') {
      for (const side of [-1, 1]) mesh(base, 'ball', theme.light, [side * .12, .19, .17], [.033, .09, .079]).rotation.z = side * -.36;
    }
  } else if (form === 'scan' || form === 'spark') {
    mesh(base, 'column', theme.rim, [0, .071, 0], [.27, .14, .27]);
    for (const [dx, height, size] of [[-.14, .23, .07], [0, form === 'scan' ? .57 : .29, .15], [.16, .20, .075]]) {
      mesh(base, 'facet', color, [dx, height, 0], [size, size * 1.30, size], 'glow').rotation.z = dx + .22;
    }
  } else {
    for (const [dx, dz, height, radius] of [[-.17, .03, .25, .14], [.035, -.078, .38, .16], [.17, .09, .20, .10]]) {
      mesh(base, 'column', theme.plants[1], [dx, height * .44, dz], [.031, height * .88, .031]);
      mesh(base, 'ball', color, [dx, height, dz], [radius, radius * .45, radius * .8]);
      mesh(base, 'ball', theme.light, [dx, height + radius * .40, dz], [radius * .33, .028, radius * .31], 'glow');
    }
  }
}

function makeFeatureEffects(model, scene, feature, theme) {
  const { mesh, radial } = model;
  const color = feature.color ?? theme.accent;
  const target = ring(model, scene, theme.light, .55);
  target.position.set(feature.x, .073, feature.z);
  const spot = mesh(scene, 'disc', radial('interaction ' + feature.id, color, .45, true),
    [feature.x, feature.height * .55 + .11, feature.z + .21], [.54, .54, 1]);
  const wave = ring(model, scene, color, .57);
  const drops = feature.form === 'water' || feature.form === 'shell';
  const sparks = Array.from({ length: 12 }, (_, index) => mesh(scene, drops ? 'ball' : 'facet',
    index % 2 ? color : theme.light, [0, 0, 0], [1, 1, 1], 'glow'));

  return (time, age, camera, clip) => {
    const ping = .5 + Math.sin(time * 2.13 + feature.x) * .50;
    const burst = age >= 0 && age < 1.52;
    const intensity = burst ? pulse(age, 0, .31, 1.52) : 0;
    const radius = feature.width * (1.09 + ping * .10);
    target.scale.set(radius, radius * .87, 1.05);
    target.material.opacity = .38 + .19 * ping + intensity * .31;
    spot.quaternion.copy(camera.quaternion);
    spot.material.opacity = .095 + intensity * .67;
    spot.scale.setScalar(.39 + intensity * .61);
    wave.visible = burst;
    if (burst) {
      const spread = feature.width + age * .59;
      wave.position.set(feature.x, feature.form === 'scan' ? .17 + age * .64 : .078, feature.z);
      wave.scale.set(spread, spread * .85, .75);
      wave.material.opacity = (1 - age / 1.52) * .71;
    }
    for (const [index, spark] of sparks.entries()) {
      const rise = age - (index % 4) * .073;
      spark.visible = burst && rise > 0 && rise < 1.10;
      if (!spark.visible) continue;
      const angle = index * 2.399 + rise * (clip === 'dance' ? 7.3 : 2.6);
      const width = feature.form === 'scan' ? .34 : .11 + rise * .49;
      const radius = width + (index % 3) * .055;
      const tall = drops || clip === 'dig' ? Math.sin(rise * Math.PI) * .54 : rise * .97 + .087;
      spark.position.set(feature.x + Math.cos(angle) * radius, .15 + tall + feature.height * .42, feature.z + Math.sin(angle) * radius);
      const size = (.045 + index % 3 * .014) * pulse(rise, 0, .23, 1.10);
      spark.scale.set(size, size * (feature.form === 'spark' ? 1.9 : 1), size);
      spark.rotation.set(rise, angle, index);
    }
  };
}

export function makeWorldInteraction(model, scene, habitat, theme, layout, random = Math.random) {
  const features = featureLayout(habitat, layout).map((feature) => {
    if (feature.id !== 'primary') sculptLandmark(model, scene, feature, theme);
    const { x, z, width, height } = feature;
    const box = new THREE.Box3(new THREE.Vector3(x - width, -.035, z - width),
      new THREE.Vector3(x + width, height + .085, z + width));
    return { ...feature, box, paint: makeFeatureEffects(model, scene, feature, theme) };
  });
  const chooseClip = shuffleClips(random);
  const terrainPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const intersection = new THREE.Vector3();
  const petHits = [];
  const marker = ring(model, scene, theme.light, .55);
  let x = HOME.x;
  let z = HOME.z;
  let trip;
  let activity;
  let signal;
  let nextAutonomous = 3.7;
  let lastChoice;
  let lastFeature;

  function pick(relativeX, relativeY, camera, pet, celestial) {
    pointer.set(relativeX * 2 - 1, 1 - relativeY * 2);
    raycaster.setFromCamera(pointer, camera);
    const { ray } = raycaster;
    petHits.length = 0;
    raycaster.intersectObject(pet.root, true, petHits);
    let closest = petHits[0]?.distance ?? Infinity;
    let hit = petHits.length ? { action: 'pet' } : null;
    for (const feature of features) {
      const object = ray.intersectBox(feature.box, intersection);
      const distance = object ? ray.origin.distanceTo(object) : Infinity;
      if (distance >= closest) continue;
      closest = distance;
      hit = { action: 'explore', target: feature.id, label: feature.label };
    }
    const sky = ray.intersectSphere(celestial.bounds, intersection);
    if (sky && ray.origin.distanceTo(sky) < closest) hit = { action: 'sky', label: celestial.label };
    if (hit) return hit;
    const ground = ray.intersectPlane(terrainPlane, intersection);
    return ground && Math.hypot(ground.x / layout.rx, ground.z / layout.rz) < 1 ? { point: { x: ground.x, z: ground.z } } : null;
  }

  function safePoint(point) {
    const safeZ = THREE.MathUtils.clamp(point.z, -.38, layout.rz * .80);
    const edge = layout.rx * Math.sqrt(1 - (safeZ / layout.rz) ** 2) - .49;
    return { x: THREE.MathUtils.clamp(point.x, -edge, edge), z: safeZ };
  }

  function walk(point, time, motion, { feature, clip, marker: mark = false, needs } = {}) {
    const to = safePoint(point);
    const distance = Math.hypot(to.x - x, to.z - z);
    const tired = (needs?.energy ?? 80) < 38;
    const duration = THREE.MathUtils.clamp(distance * (tired ? .76 : .56), .32, 3.42);
    trip = motion ? { from: { x, z }, to, at: time, duration, feature, clip, mark } : undefined;
    activity = undefined;
    if (!motion || distance < .13) {
      ({ x, z } = to);
      trip = undefined;
      if (clip) arrive(clip, time, feature);
    }
  }

  function visit(feature, time, motion, needs, clip = chooseClip(feature.id, FEATURE_CLIPS[feature.form])) {
    const direction = Math.sign(feature.x) || 1;
    const point = { x: feature.x - direction * Math.max(.57, feature.width + .25), z: Math.max(.06, feature.z + .31) };
    lastFeature = feature.id;
    walk(point, time, motion, { feature, clip, needs });
  }

  function arrive(clip, time, feature) {
    activity = { clip, at: time, feature };
    if (feature) signal = { feature, at: time + .24, clip };
  }

  function react(reaction, time, motion, needs) {
    const { action, target } = reaction;
    trip = undefined;
    activity = undefined;
    signal = undefined;
    nextAutonomous = Math.max(nextAutonomous, time + 4.8);
    if (action === 'explore') {
      const feature = features.find(({ id }) => id === target) ?? features[0];
      visit(feature, time, motion, needs);
    } else {
      activity = { action, clip: chooseClip(action), at: time };
    }
  }

  function act(time, needs) {
    const earlyVisit = lastChoice === undefined && (!needs || Object.values(needs).every((value) => value >= 49));
    const choice = earlyVisit ? 'visit' : chooseActivity(needs, lastChoice, random);
    lastChoice = choice;
    nextAutonomous = time + 4.65 + random() * 3.20;
    if (choice === 'visit') {
      const available = features.filter(({ id }) => id !== lastFeature);
      visit(available[Math.floor(random() * available.length)], time, true, needs);
    } else if (choice === 'wander' || choice === 'pace') {
      const direction = x > 0 ? -1 : 1;
      walk({ x: direction * layout.rx * (.37 + random() * .23), z: .47 + random() * .68 }, time, true,
        { clip: choice === 'pace' ? 'listen' : 'stretch', needs });
    } else if (choice === 'rest' || choice === 'yawn') {
      visit(features[2], time, true, needs, choice);
    } else if (choice === 'sniff' || choice === 'sip') {
      const feature = features.find(({ form }) => form === 'water') ?? features[1];
      visit(feature, time, true, needs, choice === 'sip' && feature.form !== 'water' ? 'sniff' : choice);
    } else if (choice === 'pounce' || choice === 'dance') {
      const direction = x > 0 ? -1 : 1;
      walk({ x: direction * layout.rx * .32, z: .94 }, time, true, { clip: choice, needs });
    } else {
      arrive(choice, time);
    }
  }

  function update(time, motion, sleeping, needs, camera, celestial) {
    if (activity && motion && time - activity.at >= clipLength(activity.clip)) activity = undefined;
    if (sleeping && activity?.action !== 'sleep') {
      activity = undefined;
      trip = undefined;
    }
    if (!sleeping && motion && !trip && !activity && time >= nextAutonomous) act(time, needs);

    let walking = 0;
    let turn = 0;
    marker.visible = false;
    if (trip && motion && !sleeping) {
      const age = time - trip.at;
      const progress = easeInOut(age, 0, trip.duration);
      x = THREE.MathUtils.lerp(trip.from.x, trip.to.x, progress);
      z = THREE.MathUtils.lerp(trip.from.z, trip.to.z, progress);
      walking = easeInOut(age, 0, .16) * (1 - easeInOut(age, trip.duration - .20, trip.duration));
      turn = THREE.MathUtils.clamp((trip.to.x - trip.from.x) * 1.38, -1.41, 1.31) * walking;
      if (trip.mark && age < .62) {
        marker.visible = true;
        marker.position.set(trip.to.x, .067, trip.to.z);
        const size = .085 + age * .50;
        marker.scale.set(size, size, .65);
        marker.material.opacity = .61 * (1 - age / .62);
      }
      if (age >= trip.duration) {
        if (trip.clip) arrive(trip.clip, time, trip.feature);
        trip = undefined;
        nextAutonomous = Math.max(nextAutonomous, time + 2.2);
      }
    }
    for (const feature of features) {
      const fired = motion && signal?.feature === feature;
      feature.paint(time, fired ? time - signal.at : -1, camera, signal?.clip);
    }
    const age = activity ? motion ? time - activity.at : .65 : 0;
    const weight = activity ? motion ? pulse(age, 0, .42, clipLength(activity.clip)) : 1 : 0;
    let gaze;
    if (activity?.action === 'sky') {
      const { x, y, z } = celestial.bounds.center;
      gaze = { x, y, z, weight, sky: true };
    } else if (activity?.feature) {
      const { x, height, z } = activity.feature;
      gaze = { x, y: height * .83, z, weight };
    }
    return { x, z, walking, turn, gaze, sleeping, clip: activity?.clip, action: activity?.action, age, skyPulse: gaze?.sky ? weight : 0 };
  }

  return { pick, walk, react, update };
}
