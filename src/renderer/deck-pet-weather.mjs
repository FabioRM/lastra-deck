import * as THREE from '../../node_modules/three/build/three.module.js';
import { particleField } from './deck-pet-atmosphere.mjs';

const SKIES = {
  clear: { cloud: 0 }, partly: { cloud: .38 }, cloud: { cloud: .81 },
  fog: { cloud: .38, fog: .88 }, frost: { cloud: .55, fog: .82, snow: .31 },
  drizzle: { cloud: .69, drizzle: .75, wet: .24 },
  rain: { cloud: .82, rain: .84, wet: .83 },
  showers: { cloud: .73, rain: 1, wet: 1 },
  ice: { cloud: .79, ice: .84, fog: .26, wet: .46 },
  sleet: { cloud: .77, drizzle: .61, ice: .53, snow: .48, wet: .52 },
  snow: { cloud: .58, snow: 1, fog: .27 },
  storm: { cloud: 1, rain: 1.15, fog: .23, wet: 1, thunder: true, gust: .64 },
  hail: { cloud: 1, rain: .77, ice: 1.2, fog: .25, wet: .82, thunder: true, gust: .61 },
  haze: { cloud: .24, fog: .54, dust: .35, warm: .58 },
  dust: { cloud: .56, fog: .56, dust: 1, warm: 1, gust: .63 },
  squall: { cloud: .84, rain: .84, fog: .30, wet: .72, gust: .90 },
  tornado: { cloud: 1, rain: .51, dust: .84, fog: .52, warm: .22, gust: 1, funnel: true },
};
const PRECIPITATION = {
  rain: { count: 148, size: .17, drift: [-.71, -4.7], shape: 4, color: '#c7e7ff' },
  drizzle: { count: 105, size: .10, drift: [-.29, -2.7], shape: 4, color: '#cdeeff' },
  ice: { count: 106, size: .099, drift: [-.41, -3.8], shape: 0, color: '#bce4fc' },
  snow: { count: 134, size: .099, drift: [-.28, -.68], shape: 1, color: '#effaff' },
  dust: { count: 132, size: .118, drift: [2.41, -.11], shape: 2, color: '#e5b47c' },
};

function cloudBanks(model, scene, random) {
  const { group, radial, mesh } = model;
  const cloud = radial('weather clouds', '#c1d5ed', 0);
  const mist = radial('weather fog', '#cde5ed', 0);
  const fogColor = new THREE.Color('#d5ecf2');
  const warmFogColor = new THREE.Color('#e2ac73');
  const clouds = Array.from({ length: 6 }, (_, index) => {
    const bank = group(scene);
    for (const [x, y, w, h] of [[-.66, -.18, 1.25, .56], [.12, .11, 1.35, .77], [.94, -.15, 1.21, .52]]) {
      mesh(bank, 'disc', cloud, [x, y, 0], [w, h, 1]);
    }
    return { bank, x: -5.8 + 2.22 * index, y: 2.12 + random() * 1.24, z: -2.8 - random() * 1.8 };
  });
  const mists = Array.from({ length: 6 }, (_, index) =>
    mesh(scene, 'disc', mist, [0, 0, 0], [1.8 + random() * .65, .22 + index * .035, 1]));
  return (time, camera, sky, cloudDensity, wind) => {
    mist.opacity = (sky.fog ?? 0) * .57;
    mist.color.copy(fogColor).lerp(warmFogColor, sky.warm ?? 0);
    cloud.opacity = cloudDensity * .62;
    cloud.color.set(sky.thunder || sky.funnel ? '#7189b3' : '#c1d5ed');
    for (const { bank, x, y, z } of clouds) {
      bank.visible = cloudDensity > .03;
      if (!bank.visible) continue;
      bank.position.set(THREE.MathUtils.euclideanModulo(x + time * (.13 + wind * .20) + 7, 14) - 7,
        y - cloudDensity * .20, z);
      bank.quaternion.copy(camera.quaternion);
    }
    mists.forEach((bank, index) => {
      bank.visible = mist.opacity > .01;
      if (!bank.visible) return;
      bank.position.set(THREE.MathUtils.euclideanModulo(index * 2.65 - time * (.24 + wind * .37), 14) - 7,
        .20 + (index % 3) * .25 + Math.sin(time * .43 + index) * .07, -.16 + (index % 2) * 2.06);
      bank.quaternion.copy(camera.quaternion);
    });
  };
}

function makeWeatherEffects(model, scene, random, layout) {
  const { mesh, track, group } = model;
  const ringInk = track(new THREE.MeshBasicMaterial({ color: '#9bd5ed', transparent: true, depthWrite: false }));
  const ripples = Array.from({ length: 17 }, (_, index) => {
    const z = (random() - .38) * layout.rz * 1.4;
    const x = (random() - .5) * layout.rx * 1.7 * Math.sqrt(1 - (z / layout.rz) ** 2);
    const ring = mesh(scene, 'ring', ringInk, [x, .063, z], [1, 1, 1]);
    ring.rotation.x = -Math.PI / 2;
    return { ring, phase: random(), speed: 1 + index % 3 * .22 };
  });

  const flashInk = track(new THREE.LineBasicMaterial({ color: '#d5eaff', transparent: true, depthWrite: false, opacity: 0 }));
  const bolt = group(scene, 2.78, 2.77, -2.36);
  for (const path of [[[.1, 1.14], [-.31, .65], [.04, .58], [-.36, .12], [-.16, .10], [-.62, -.60]],
    [[-.31, .65], [-.77, .31], [-.69, -.02], [-1.11, -.23]], [[-.36, .12], [.04, -.13], [-.11, -.47]]]) {
    const branches = track(new THREE.BufferGeometry().setFromPoints(path.map(([x, y]) => new THREE.Vector3(x, y, 0))));
    bolt.add(new THREE.Line(branches, flashInk));
  }

  const funnel = group(scene, 2.40, .26, -1.56);
  const dustColor = model.radial('funnel dust', '#b4bdcc', .49);
  const coils = Array.from({ length: 9 }, (_, index) => mesh(funnel, 'disc', dustColor,
    [0, index * .23, 0], [.12 + index * .045, .14 + index * .018, 1]));

  return (time, motion, camera, sky) => {
    const cycle = time % 12.7;
    const flash = sky.thunder && motion && cycle > 4.2 && cycle < 4.68 ? Math.sin((cycle - 4.2) / .48 * Math.PI) ** 4 : 0;
    bolt.visible = flash > .08;
    flashInk.opacity = flash * .73;
    const wet = sky.wet ?? 0;
    ringInk.opacity = wet * .50;
    for (const { ring, phase, speed } of ripples) {
      const ripple = (time * speed + phase) % 1;
      ring.visible = wet > .1 && ripple < .56;
      if (ring.visible) {
        const spread = .022 + .29 * ripple;
        ring.scale.set(spread, spread, 1);
      }
    }
    funnel.visible = sky.funnel === true;
    if (funnel.visible) {
      funnel.position.x = 2.32 + Math.sin(time * .46) * .35;
      coils.forEach((coil, index) => {
        const turn = time * 2.8 + index * .87;
        coil.position.x = Math.sin(turn) * (.063 + index * .029) + index * .055;
        coil.position.z = Math.cos(turn) * (.072 + index * .025);
        coil.quaternion.copy(camera.quaternion);
        coil.rotateZ(Math.sin(turn) * .4);
      });
    }
    return flash;
  };
}

export function makePetWeather(model, scene, random, layout) {
  const fields = Object.entries(PRECIPITATION).map(([kind, settings]) => [kind, particleField(model, scene, random, settings)]);
  const paintBanks = cloudBanks(model, scene, random);
  const paintEffects = makeWeatherEffects(model, scene, random, layout);

  return (climate, time, motion, camera, scale) => {
    const sky = SKIES[climate?.kind] ?? SKIES.clear;
    const cloud = Math.max(sky.cloud, Math.min(1, (climate?.cloudCover ?? 0) / 100) * .89);
    const wind = Math.max(sky.gust ?? 0, Math.min(1, (climate?.wind ?? 0) / 65));
    const intensity = climate?.intensity ?? 1;
    for (const [kind, field] of fields) field(time * (1 + wind * .43), scale, (sky[kind] ?? 0) * intensity);
    paintBanks(time, camera, sky, cloud, wind);
    const flash = paintEffects(time, motion, camera, sky);
    return { cloud, wind, flash, haze: sky.fog ?? 0 };
  };
}
