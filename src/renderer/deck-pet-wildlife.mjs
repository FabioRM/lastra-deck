import * as THREE from '../../node_modules/three/build/three.module.js';
import { arc, easeInOut } from './deck-pet-animals.mjs';

const POPULATIONS = {
  grove: ['bird', 'butterfly', 'mouse'],
  moon: ['moth', 'mouse', 'moth'],
  tide: ['bird', 'crab', 'butterfly'],
  aurora: ['bird', 'mouse', 'bird'],
  oasis: ['butterfly', 'bird', 'mouse'],
  orbit: ['bot', 'satellite', 'satellite'],
  neon: ['bot', 'satellite', 'bot'],
  cyber: ['moth', 'satellite', 'bot'],
};

const LABELS = {
  bird: 'Tiny bird', butterfly: 'Butterfly', mouse: 'Little mouse', moth: 'Moth',
  crab: 'Little crab', bot: 'Mini rover', satellite: 'Micro drone',
};

function winged(model, root, kind, theme, index) {
  const { mesh, group } = model;
  const bird = kind === 'bird';
  const bot = kind === 'satellite';
  const ink = bird ? ['#6bbace', '#fbc17b', '#b295ee'][index] : kind === 'moth' ? '#d7abff' : theme.light;
  const dark = bot ? '#32446f' : bird ? '#344a6c' : '#634b72';
  const body = group(root);
  mesh(body, 'foliage', bot ? dark : ink, [0, 0, 0], bird ? [.094, .094, .146] : [.072, .051, .100]);
  if (bird) {
    mesh(body, 'ball', '#fff0ce', [0, -.028, .040], [.077, .074, .103]);
    mesh(body, 'foliage', ink, [0, .062, .099], [.071, .076, .076]);
    mesh(body, 'cone', '#f9ae63', [0, .052, .178], [.032, .065, .032]).rotation.x = Math.PI / 2;
    mesh(body, 'facet', dark, [0, .022, -.14], [.071, .025, .100]);
  } else if (bot) {
    mesh(body, 'facet', theme.accent, [0, .030, .050], [.056, .040, .054], 'glow');
    mesh(body, 'ball', theme.light, [0, -.049, .004], [.034, .034, .06], 'glow');
  }
  const wings = [-1, 1].map((side) => {
    const hinge = group(body, side * .052, .01, -.013);
    if (bird) {
      mesh(hinge, 'facet', ink, [side * .081, 0, -.021], [.148, .029, .076]).rotation.y = -side * .24;
      mesh(hinge, 'facet', dark, [side * .177, -.005, -.046], [.064, .021, .048]);
      mesh(body, 'ball', '#192337', [side * .045, .073, .144], [.015, .016, .013]);
    } else if (bot) {
      mesh(hinge, 'box', '#6977a5', [side * .099, 0, -.013], [.137, .029, .071]);
      mesh(hinge, 'box', theme.accent, [side * .109, .017, -.013], [.107, .007, .050], 'glow');
    } else {
      mesh(hinge, 'foliage', ink, [side * .092, 0, .056], [.114, .019, .106]).rotation.y = side * .2;
      mesh(hinge, 'foliage', theme.accent, [side * .073, -.004, -.060], [.089, .018, .072]);
      mesh(hinge, 'ball', '#fff3dc', [side * .12, .020, .076], [.026, .011, .024], 'glow');
    }
    return { hinge, side };
  });
  return (time, motion, flying, peck) => {
    const flap = motion ? Math.sin(time * (bird ? 18 : bot ? 7 : 27)) : .6;
    for (const { hinge, side } of wings) {
      hinge.rotation.z = side * (flying * flap * (bot ? .28 : 1.12) + (1 - flying) * (bird ? -.54 : .95));
    }
    body.rotation.x = peck * (bird ? .59 : bot ? .11 : .24);
  };
}

function groundDweller(model, root, kind, theme) {
  const { group, mesh, link } = model;
  const mouse = kind === 'mouse';
  const crab = kind === 'crab';
  const tint = mouse ? '#d9ad9e' : crab ? '#ed8e87' : '#8488bd';
  const body = group(root);
  mesh(body, 'foliage', tint, [0, .102, -.028], [.116, .091, .149]);
  const head = group(body, 0, .117, .086);
  mesh(head, 'ball', tint, [0, 0, 0], [mouse ? .076 : .087, .069, .080]);
  mesh(head, 'ball', mouse ? '#805572' : theme.light, [0, -.019, .075], [.037, .027, .029], mouse ? undefined : 'glow');
  const tail = group(body, 0, .061, -.158);
  if (mouse) {
    link(tail, 'column', '#edaaac', [0, 0, .02], [.020, .006, -.094], .012);
    link(tail, 'column', '#edaaac', [.020, .006, -.094], [.092, .051, -.14], .009);
  } else if (!crab) {
    link(body, 'column', '#6d7094', [0, .14, -.069], [-.057, .241, -.091], .012);
    mesh(body, 'ball', theme.accent, [-.057, .241, -.091], [.026, .026, .026], 'glow');
  }
  const feet = [];
  for (const side of [-1, 1]) {
    mesh(head, 'ball', '#302e46', [side * .037, .025, .062], [.018, .021, .016]);
    if (mouse) {
      mesh(head, 'ball', tint, [side * .056, .059, -.020], [.041, .044, .028]);
      mesh(head, 'ball', '#f4c1b8', [side * .056, .062, .001], [.029, .029, .011]);
    }
    if (crab) mesh(body, 'facet', '#ffb49e', [side * .112, .041, .109], [.045, .033, .062]).rotation.y = side * .3;
    for (const end of [-1, 1]) {
      const foot = mesh(body, mouse ? 'ball' : 'box', mouse ? '#ebbaad' : '#525775',
        [side * .077, .023, end * .069], [.037, .026, .050]);
      feet.push({ foot, side, end });
    }
  }
  return (time, motion, speed, sniff) => {
    const stride = motion ? Math.sin(time * 20) * speed : 0;
    body.position.y = Math.abs(stride) * .035;
    for (const { foot, side, end } of feet) foot.rotation.x = stride * side * end * .85;
    head.rotation.x = sniff * .54;
    head.rotation.y = motion ? Math.sin(time * 10) * sniff * .24 : 0;
    tail.rotation.y = stride * .61;
  };
}

export function makeWildlife(model, scene, habitat, theme, layout, features) {
  const [primary, landmark, bed] = features;
  const point = (x, y, z) => new THREE.Vector3(x, y, z);
  const sign = Math.sign(primary.x);
  const critters = POPULATIONS[habitat].map((kind, index) => {
    const airborne = ['bird', 'butterfly', 'moth', 'satellite'].includes(kind);
    const perching = kind === 'bird';
    const root = model.group(scene);
    root.scale.setScalar(index === 2 ? .91 : 1.04);
    const rig = airborne ? winged(model, root, kind, theme, index) : groundDweller(model, root, kind, theme);
    const from = airborne
      ? point(-sign * layout.rx * (.59 + index * .08), perching ? .70 : .53 + index * .33, index ? .50 : -.59)
      : point(sign * layout.rx * (.56 - index * .14), .035, .77 + index * .19);
    const target = index === 0 ? primary : index === 1 ? landmark : bed;
    const to = airborne
      ? point(target.x, target.height + (kind === 'satellite' ? .35 : .085), target.z + .11)
      : point(target.x - Math.sign(target.x) * (target.width + .23), .035, Math.min(1.37, target.z + .36));
    const bounds = new THREE.Sphere(point(0, 0, 0), airborne ? .235 : .186);
    return { root, rig, from, to, bounds, target, airborne, perching, label: LABELS[kind], phase: 1.6 + index * 3.17,
      period: 9.7 + index * 1.8, retreat: 0, contactAge: -1 };
  });
  const hitPoint = new THREE.Vector3();
  const nearbyRadius = 2.25;

  function paint(time, motion, pet) {
    for (const [index, critter] of critters.entries()) {
      const { root, rig, from, to, airborne, perching, phase, period, bounds } = critter;
      const phaseTime = (time + phase) % period / period;
      const travel = easeInOut(phaseTime, 0, .41) - easeInOut(phaseTime, .60, .94);
      const flutter = arc(phaseTime, 0, .41) + arc(phaseTime, .60, .94);
      const settled = 1 - shuffleStep(flutter);
      root.position.lerpVectors(from, to, travel);
      if (airborne) {
        root.position.y += flutter * (perching ? .64 : .47) + Math.sin(time * 3.4 + phase) * .10 * (perching ? flutter : .72);
        root.position.z += flutter * Math.sin(time * 2.3 + phase) * .18;
      } else {
        const distance = Math.hypot(root.position.x - pet.x, root.position.z - pet.z);
        const proximity = motion && !pet.sleeping && distance < .78 ? 1 : 0;
        critter.retreat += (proximity - critter.retreat) * (proximity ? .11 : .034);
        root.position.x -= sign * .47 * critter.retreat;
        root.position.z += .19 * critter.retreat;
      }
      const turn = easeInOut(phaseTime, .46, .60) + easeInOut(phaseTime, .91, 1);
      root.rotation.y = Math.atan2(to.x - from.x, to.z - from.z) + (turn + critter.retreat) * Math.PI
        + Math.sin(time * 1.6 + phase) * .20;
      root.rotation.z = airborne ? Math.sin(time * 3.1 + phase) * .31 * flutter : 0;
      const beats = settled * (.5 + Math.sin(time * (3.8 + index) + phase) * .5);
      const drive = airborne ? perching ? shuffleStep(flutter) : .65 + flutter * .35 : Math.max(flutter, critter.retreat);
      rig(time + phase, motion, drive, beats);
      bounds.center.copy(root.position);
      if (!airborne) bounds.center.y += .10;
      const arrival = (phaseTime - .41) * period;
      critter.contactAge = motion && critter.retreat < .18 && arrival >= 0 && arrival < 1.52 ? arrival : -1;
    }
  }

  function pick(ray, limit) {
    let target;
    for (const critter of critters) {
      if (!ray.intersectSphere(critter.bounds, hitPoint)) continue;
      const distance = ray.origin.distanceTo(hitPoint);
      if (distance >= limit) continue;
      limit = distance;
      target = critter;
    }
    return target;
  }

  function nearby(x, z) {
    return critters.find(({ root }) => Math.hypot(root.position.x - x, root.position.z - z) < nearbyRadius);
  }

  function contact(feature) {
    return critters.find((critter) => critter.target === feature)?.contactAge ?? -1;
  }

  return { paint, pick, nearby, contact };
}

const shuffleStep = (speed) => Math.min(1, speed * 1.8);
