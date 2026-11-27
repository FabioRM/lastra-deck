import * as THREE from '../../node_modules/three/build/three.module.js';
import { arc, easeInOut, pulse } from './deck-pet-animals.mjs';
import { clipEffect } from './deck-pet-behavior.mjs';

function heartShape() {
  const shape = new THREE.Shape();
  shape.moveTo(0, -.55);
  shape.bezierCurveTo(-1.01, .10, -.70, .99, 0, .47);
  shape.bezierCurveTo(.70, .99, 1.01, .10, 0, -.55);
  return new THREE.ShapeGeometry(shape, 18);
}

function sleepShape() {
  const letter = new THREE.Shape();
  letter.moveTo(-.40, .32);
  letter.lineTo(.41, .32);
  letter.lineTo(.41, .18);
  letter.lineTo(-.16, -.23);
  letter.lineTo(.41, -.23);
  letter.lineTo(.41, -.36);
  letter.lineTo(-.40, -.36);
  letter.lineTo(-.40, -.20);
  letter.lineTo(.15, .19);
  letter.lineTo(-.40, .19);
  return new THREE.ShapeGeometry(letter);
}

function movesFruit(apple, age, effect) {
  const travel = easeInOut(age, .13, .91);
  const munch = easeInOut(age, .79, .95);
  apple.visible = age < .96;
  const toss = effect === 'toss';
  const sniff = effect === 'sniff';
  const rise = toss ? 1.18 : sniff ? .06 : .19;
  const height = .17 + (sniff ? .82 : 1.00) * travel + rise * arc(age, .14, .89);
  apple.position.set(1.06 - travel * .79, height, 1.24 + .07 * travel);
  apple.rotation.set(.10 - travel * .23, travel * (toss ? 9.75 : 3.30), .17 - travel * .71);
  apple.scale.setScalar(Math.max(.001, easeInOut(age, .02, .23) * (1 - munch)));
}

const FLOOR = .19;
// [Time, x, y, z, lift above the straight path, ground contact]
const BALL_PATHS = {
  fetch: [[0, -1.04, FLOOR, 1.30], [.36, -.67, FLOOR, 1.30], [1.02, .38, FLOOR, 1.36, 1.07, true],
    [1.72, 1.29, FLOOR, 1.23, .49, true], [2.13, 1.44, FLOOR, 1.22]],
  dribble: [[0, 1.22, .44, 1.19], [.28, .83, .91, 1.18], [.64, .70, FLOOR, 1.23, 0, true],
    [.93, .65, .94, 1.23], [1.24, .19, FLOOR, 1.27, .16, true], [1.52, -.27, .89, 1.22],
    [1.85, -.69, FLOOR, 1.26, .12, true], [2.21, -.94, FLOOR, 1.24, .36, true], [2.62, -1.18, FLOOR, 1.18]],
  volley: [[0, -1.22, FLOOR, 1.26], [.31, -.78, FLOOR, 1.22, .38, true], [.65, -.42, 1.35, 1.19],
    [1.31, .66, 1.46, 1.17, .56], [1.86, 1.37, FLOOR, 1.31, .72, true],
    [2.24, 1.22, FLOOR, 1.23, .39, true], [2.61, 1.01, FLOOR, 1.21]],
  leapfrog: [[0, -1.24, FLOOR, 1.08], [.24, -.88, FLOOR, 1.09], [.60, -.35, FLOOR, 1.11],
    [.94, .49, FLOOR, 1.16], [1.29, 1.27, FLOOR, 1.27, .16, true], [1.59, .63, FLOOR, 1.29, .25, true],
    [1.87, .09, .57, 1.30], [2.16, -.61, FLOOR, 1.27, .14, true], [2.34, -.88, FLOOR, 1.25]],
};

export function playBallPosition(clip, age) {
  const path = BALL_PATHS[clip];
  if (!path || age < 0 || age > path.at(-1)[0]) return undefined;
  const next = Math.max(1, path.findIndex(([at]) => at >= age));
  const [start, x, y, z] = path[next - 1];
  const [end, nextX, nextY, nextZ, lift = 0] = path[next];
  const progress = (age - start) / (end - start);
  return [
    THREE.MathUtils.lerp(x, nextX, progress),
    THREE.MathUtils.lerp(y, nextY, progress) + lift * 4 * progress * (1 - progress),
    THREE.MathUtils.lerp(z, nextZ, progress),
  ];
}

export function makeReactions(model, scene, theme) {
  const { group, mesh, radial, geometry } = model;
  const apple = group(scene);
  mesh(apple, 'ball', '#f68b6e', [-.049, 0, 0], [.123, .147, .12]);
  mesh(apple, 'ball', '#f9a16e', [.055, 0, 0], [.119, .141, .117]);
  mesh(apple, 'ball', '#ffd293', [-.083, .046, .098], [.038, .051, .022]);
  mesh(apple, 'column', '#926452', [0, .14, 0], [.015, .068, .015]).rotation.z = -.23;
  mesh(apple, 'ball', '#85ad75', [.056, .157, 0], [.079, .025, .049]).rotation.z = .39;

  const bottle = group(scene);
  mesh(bottle, 'ball', '#a6f4cd', [0, 0, 0], [.105, .142, .082]);
  mesh(bottle, 'column', '#fee8ad', [0, .145, 0], [.056, .047, .056]);
  mesh(bottle, 'box', '#fff4de', [0, .015, .074], [.138, .084, .016]);
  const recovery = Array.from({ length: 6 }, () => {
    const mark = group(scene);
    mesh(mark, 'box', '#bdffe0', [0, 0, 0], [.35, .10, .053], 'glow');
    mesh(mark, 'box', '#bdffe0', [0, 0, 0], [.10, .35, .053], 'glow');
    return mark;
  });

  function updateMedicine(effect, clip, age, camera) {
    bottle.visible = effect === 'medicine' && age < 1.16;
    if (bottle.visible) {
      const sip = easeInOut(age, .18, .86);
      const side = clip === 'remedy' ? -1 : 1;
      bottle.position.set(.25 + side * (.70 - sip * .54), .24 + sip * 1.02, 1.16);
      bottle.rotation.z = side * (sip * 1.14);
      bottle.scale.setScalar(pulse(age, 0, .25, 1.17));
    }
    for (const [index, mark] of recovery.entries()) {
      const rise = age - .73 - index * .092;
      mark.visible = effect === 'medicine' && rise > 0 && rise < 1.02;
      if (!mark.visible) continue;
      const angle = index * 2.399 + rise * 2;
      mark.position.set(.25 + Math.sin(angle) * (.35 + rise * .63), .87 + rise * 1.19, .75 + Math.cos(angle) * .42);
      mark.quaternion.copy(camera.quaternion);
      mark.rotateZ(Math.sin(angle) * .29);
      mark.scale.setScalar(.41 * pulse(rise, 0, .33, 1.02));
    }
  }

  const toy = group(scene);
  mesh(toy, 'ball', '#ff956a', [0, 0, 0], [.189, .189, .189]);
  const stitching = geometry('toy stitching', () => new THREE.TorusGeometry(1, .029, 6, 40));
  for (const [color, roll] of [['#ffe9b9', 0], ['#ffdc89', 1.18]]) {
    mesh(toy, stitching, color, [0, 0, 0], [.189, .189, .162], 'glow').rotation.x = roll;
  }
  mesh(toy, 'ball', '#a0ece2', [0, .10, .131], [.072, .072, .041]).rotation.x = -.54;
  mesh(toy, 'ball', '#a0ece2', [0, -.10, -.131], [.072, .072, .041]).rotation.x = -.54;
  const trail = radial('toy glint', '#ffdb9d', .63, true);
  const echoes = Array.from({ length: 5 }, () => mesh(scene, 'disc', trail,
    [0, 0, 0], [.11, .11, 1]));
  const ring = mesh(scene, 'ring', model.custom('impact', () => new THREE.MeshBasicMaterial({
    color: theme.accent, transparent: true, depthWrite: false,
  })), [0, .025, 0], [1, 1, 1]);
  ring.rotation.x = -Math.PI / 2;

  const heart = geometry('reaction heart', heartShape);
  const hearts = Array.from({ length: 7 }, (_, index) => {
    const love = group(scene);
    const colors = ['#ff93ba', '#ffc2d6', '#f1a9e6'];
    mesh(love, 'disc', radial('cuddle halo', '#ff9cc4', .46, true), [0, 0, -.025], [1.54, 1.54, 1]);
    mesh(love, heart, colors[index % colors.length], [0, 0, 0], [1, 1, 1], 'glow');
    mesh(love, 'ball', '#fff3ef', [-.27, .34, .025], [.133, .041, .023], 'glow').rotation.z = .62;
    return love;
  });
  const sparks = Array.from({ length: 14 }, (_, index) => {
    const flash = group(scene);
    mesh(flash, 'facet', index % 3 ? theme.light : '#ffb692', [0, 0, 0], [.46, 1, .44], 'glow');
    return flash;
  });
  const bubbles = Array.from({ length: 17 }, (_, index) => {
    const bubble = group(scene);
    mesh(bubble, 'disc', radial('soap glow', '#8df3ff', .45, true), [0, 0, -.05], [1.05, 1.05, 1]);
    mesh(bubble, 'ring', index % 2 ? '#c6f9ff' : '#92dfe8', [0, 0, 0], [.72, .72, .75], 'glow');
    mesh(bubble, 'ball', '#f2ffff', [-.29, .39, .045], [.127, .073, .036], 'glow');
    return bubble;
  });
  const letter = geometry('sleep glyph', sleepShape);
  const sleep = Array.from({ length: 3 }, () =>
    mesh(scene, letter, '#c8d9ff', [0, 0, 0], [1, 1, 1], 'glow'));
  const notes = [.36, .80, 1.24, 1.68, 2.02].map((at, index) => {
    const root = group(scene);
    const color = ['#ffe19c', '#a6f3e4', '#f4b5eb'][index % 3];
    mesh(root, 'disc', trail, [0, .07, -.03], [.76, .76, 1]);
    mesh(root, 'ball', color, [-.12, -.17, 0], [.22, .13, .06], 'glow').rotation.z = .28;
    mesh(root, 'box', color, [.06, .102, 0], [.086, .57, .074], 'glow');
    mesh(root, 'ball', color, [.20, .313, 0], [.19, .074, .049], 'glow').rotation.z = -.36;
    return { root, at };
  });

  function updateToy(clip, age, camera) {
    const path = BALL_PATHS[clip];
    const end = path.at(-1)[0];
    toy.visible = age < end;
    const position = playBallPosition(clip, age);
    if (position) toy.position.set(...position);
    const radius = easeInOut(age, 0, .18) * (1 - easeInOut(age, end - .27, end));
    const contact = path.find(([at, , , , , ground]) => ground && Math.abs(age - at) < .12);
    const squash = contact ? pulse(age, contact[0] - .07, contact[0], contact[0] + .12) : 0;
    toy.scale.set(radius * (1 + squash * .15), radius * (1 - squash * .21), radius * (1 + squash * .15));
    toy.rotation.set(age * 5.8, age * 7.6, age * -5.5);
    echoes.forEach((echo, index) => {
      const previous = age - (index + 1) * .046;
      echo.visible = toy.visible && previous > .16 && (clip !== 'leapfrog' || age > 1.22);
      if (!echo.visible) return;
      echo.position.set(...playBallPosition(clip, previous));
      const size = (.155 - index * .022) * radius;
      echo.scale.set(size, size, 1);
      echo.quaternion.copy(camera.quaternion);
    });
    const impact = path.findLast(([at, , , , , ground]) => ground && age >= at && age - at < .34);
    ring.visible = Boolean(impact);
    if (impact) {
      const [at, x, , z] = impact;
      const impactAge = age - at;
      ring.position.set(x, .035, z);
      const size = .14 + impactAge * 1.75;
      ring.scale.set(size, size * .87, .42);
      ring.material.opacity = .58 * (1 - impactAge / .34);
    }
    return impact;
  }

  function updateSong(effect, age, camera) {
    for (const [index, { root, at }] of notes.entries()) {
      const drift = age - at;
      root.visible = effect === 'music' && drift >= 0 && drift < .82;
      if (!root.visible) continue;
      const side = index % 2 ? -1 : 1;
      root.position.set(.25 + side * (.11 + drift * .74) + Math.sin(drift * 5 + index) * .08,
        1.60 + drift * 1.48, 1.10 + drift * .25);
      root.scale.setScalar((.42 - index * .025) * pulse(drift, 0, .21, .82));
      root.quaternion.copy(camera.quaternion);
      root.rotateZ(side * (.18 + drift * .36));
    }
  }

  function updateHearts(age, camera, flop) {
    hearts.forEach((love, index) => {
      const rise = age - (.22 + index * .106);
      const spread = index % 2 ? -1 : 1;
      love.visible = rise > 0 && rise < 1.24;
      if (!love.visible) return;
      const float = rise / 1.24;
      love.position.set(.27 + (flop ? .34 : 0) + spread * (.24 + index * .073) * (float + .58) + Math.sin(float * 5 + index) * .115,
        (flop ? .98 : 1.43) + index * .028 + float * 1.44, 1.32 + index * .03);
      const scale = (.24 - index * .015) * easeInOut(rise, 0, .24) * (1 - easeInOut(float, .67, 1));
      love.scale.setScalar(scale * (1 + .12 * Math.sin(float * 16)));
      love.quaternion.copy(camera.quaternion);
      love.rotateZ(spread * .20 + Math.sin(float * 7 + index) * .23);
    });
  }

  function updateSparks(effect, age, impact) {
    const fruit = effect === 'snack' || effect === 'toss';
    const ground = effect === 'dust' || Boolean(impact);
    const orbit = effect === 'ribbon';
    const glints = effect === 'glints' || effect === 'sniff';
    const time = age - (impact?.[0] ?? (fruit ? .79 : .21));
    const sourceX = impact?.[1] ?? .28;
    const sourceZ = impact?.[3] ?? (ground ? 1.36 : 1.04);
    sparks.forEach((flash, index) => {
      const burst = time - (orbit ? index * .038 : (index % 4) * .025);
      flash.visible = (ground || fruit || orbit || glints || effect === 'stars') && burst > 0 && burst < (orbit ? 1.12 : .73);
      if (!flash.visible) return;
      const angle = index * 2.399 + (orbit ? burst * 7.5 : 0);
      const distance = orbit ? .67 + burst * .31 : Math.sqrt(burst) * (.40 + index % 4 * .14);
      const up = ground ? .10 + 1.5 * burst - 1.58 * burst ** 2 : 1.20 + (glints ? .65 : 1.46) * burst - .79 * burst ** 2;
      flash.position.set(sourceX + Math.cos(angle) * distance, up + .24 * distance * Math.sin(angle),
        sourceZ + Math.sin(angle) * distance * (orbit ? .66 : .30));
      flash.rotation.set(index, time * 4, angle + time * 3);
      flash.scale.setScalar((.055 + index % 3 * .026) * pulse(burst, 0, .19, orbit ? 1.12 : .73));
    });
  }

  function updateWash(effect, age, camera) {
    const spray = effect === 'splash';
    bubbles.forEach((bubble, index) => {
      const rise = age - .06 - index * (spray ? .038 : .072);
      bubble.visible = (effect === 'bubbles' || spray) && rise >= 0 && rise < 1.13;
      if (!bubble.visible) return;
      const angle = index * 2.399 + rise * 4;
      const size = (.074 + index % 4 * .024) * pulse(rise, 0, .32, 1.13);
      const radius = .32 + rise * (spray ? 1.20 : .44);
      const height = spray ? .29 + 2.83 * rise - 2.45 * rise * rise : .37 + rise * 1.45;
      bubble.position.set(.25 + Math.cos(angle) * radius, height + (index % 3) * .13,
        .86 + Math.sin(angle) * radius * .54);
      bubble.scale.setScalar(size);
      bubble.quaternion.copy(camera.quaternion);
    });
  }

  function updateSleep(sleeping, time, camera) {
    sleep.forEach((letter, index) => {
      letter.visible = sleeping;
      if (!sleeping) return;
      const position = (index / 3 + time * .36 + .12) % 1;
      letter.position.set(.53 + position * .67, 1.17 + position * .97, .83 - index * .039);
      letter.scale.setScalar(.034 + Math.sin(position * Math.PI) * .205);
      letter.quaternion.copy(camera.quaternion);
      letter.rotateZ(-.22 + time * 0.04 % .17);
    });
  }

  return (clip, age, camera, sleeping, time, action) => {
    const effect = clipEffect(clip);
    updateMedicine(effect, clip, age, camera);
    if (effect === 'snack' || effect === 'toss' || (effect === 'sniff' && action === 'feed')) movesFruit(apple, age, effect);
    else apple.visible = false;
    let impact;
    if (effect === 'ball') impact = updateToy(clip, age, camera);
    else for (const part of [toy, ring, ...echoes]) part.visible = false;
    updateSong(effect, age, camera);
    if (effect === 'hearts') updateHearts(age, camera, clip === 'flop');
    else for (const love of hearts) love.visible = false;
    updateSparks(effect, age, impact);
    updateWash(effect, age, camera);
    updateSleep(sleeping, time, camera);
  };
}
