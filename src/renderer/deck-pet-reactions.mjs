import * as THREE from '../../node_modules/three/build/three.module.js';
import { arc, easeInOut, pulse } from './deck-pet-animals.mjs';

const DURATIONS = { feed: 2.22, play: 2.10, pet: 2.34, wash: 2.42, explore: 2.65, wake: 1.21 };

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

function movesFruit(apple, age) {
  const travel = easeInOut(age, .13, .91);
  const munch = easeInOut(age, .79, .95);
  apple.visible = age < .96;
  apple.position.set(1.06 - travel * .79, .17 + .94 * travel + .15 * arc(age, .14, .89), 1.24 + .07 * travel);
  apple.rotation.set(.10 - travel * .23, travel * 3.3, .17 - travel * .71);
  apple.scale.setScalar(Math.max(.001, easeInOut(age, .02, .23) * (1 - munch)));
}

function ballPosition(age) {
  if (age < .36) {
    const release = easeInOut(age, 0, .36);
    return [-1.04 + release * .37, .16, 1.30];
  }
  if (age < 1.02) {
    const fraction = (age - .36) / .66;
    return [-.67 + fraction * 1.05, .16 + 1.07 * arc(age, .36, 1.02), 1.30 + fraction * .06];
  }
  const fraction = Math.min(1, (age - 1.02) / .70);
  return [.38 + fraction * .91, .16 + .49 * arc(age, 1.02, 1.72), 1.36 - fraction * .13];
}

export function makeReactions(model, scene, theme) {
  const { group, mesh, radial, geometry } = model;
  const apple = group(scene);
  mesh(apple, 'ball', '#f68b6e', [-.049, 0, 0], [.123, .147, .12]);
  mesh(apple, 'ball', '#f9a16e', [.055, 0, 0], [.119, .141, .117]);
  mesh(apple, 'ball', '#ffd293', [-.083, .046, .098], [.038, .051, .022]);
  mesh(apple, 'column', '#926452', [0, .14, 0], [.015, .068, .015]).rotation.z = -.23;
  mesh(apple, 'ball', '#85ad75', [.056, .157, 0], [.079, .025, .049]).rotation.z = .39;

  const toy = group(scene);
  mesh(toy, 'ball', '#f5b876', [0, 0, 0], [.159, .159, .159]);
  mesh(toy, 'ball', '#ef869d', [0, 0, 0], [.145, .165, .145]);
  for (const rotation of [0, 1.19]) {
    mesh(toy, 'ring', '#fff3b2', [0, 0, 0], [.160, .160, .25], 'glow').rotation.x = rotation;
  }
  const echoes = Array.from({ length: 5 }, () => mesh(scene, 'disc', radial('toy glint', theme.accent, .69, true),
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

  function updateToy(age, camera) {
    const visible = age < 2.02;
    const [x, y, z] = ballPosition(age);
    toy.visible = visible;
    toy.position.set(x, y, z);
    const radius = easeInOut(age, 0, .17) * (1 - easeInOut(age, 1.81, 2.03));
    const squash = pulse(age, .95, 1.02, 1.10) + pulse(age, 1.65, 1.72, 1.82);
    toy.scale.set(radius * (1 + squash * .15), radius * (1 - squash * .21), radius * (1 + squash * .15));
    toy.rotation.set(age * 5.8, age * 7.6, age * -5.5);
    echoes.forEach((echo, index) => {
      const previous = age - (index + 1) * .046;
      echo.visible = visible && previous > .36;
      if (!echo.visible) return;
      echo.position.set(...ballPosition(previous));
      const size = (.155 - index * .022) * radius;
      echo.scale.set(size, size, 1);
      echo.quaternion.copy(camera.quaternion);
    });
    const second = age >= 1.72;
    const impactAge = age - (second ? 1.72 : 1.02);
    ring.visible = impactAge >= 0 && impactAge < .34;
    if (ring.visible) {
      ring.position.set(second ? 1.29 : .38, .030, second ? 1.23 : 1.36);
      const size = .14 + impactAge * 1.75;
      ring.scale.set(size, size * .87, .42);
      ring.material.opacity = .58 * (1 - impactAge / .34);
    }
  }

  function updateHearts(age, camera) {
    hearts.forEach((love, index) => {
      const rise = age - (.22 + index * .106);
      const spread = index % 2 ? -1 : 1;
      love.visible = rise > 0 && rise < 1.24;
      if (!love.visible) return;
      const float = rise / 1.24;
      love.position.set(.27 + spread * (.24 + index * .073) * (float + .58) + Math.sin(float * 5 + index) * .115,
        1.43 + index * .028 + float * 1.44, 1.32 + index * .03);
      const scale = (.24 - index * .015) * easeInOut(rise, 0, .24) * (1 - easeInOut(float, .67, 1));
      love.scale.setScalar(scale * (1 + .12 * Math.sin(float * 16)));
      love.quaternion.copy(camera.quaternion);
      love.rotateZ(spread * .20 + Math.sin(float * 7 + index) * .23);
    });
  }

  function updateSparks(action, age) {
    const play = action === 'play';
    const time = age - (play ? age >= 1.72 ? 1.72 : 1.02 : .79);
    const sourceX = play ? age >= 1.72 ? 1.29 : .38 : .28;
    const sourceZ = play ? 1.36 : 1.44;
    sparks.forEach((flash, index) => {
      const burst = time - (index % 4) * .025;
      flash.visible = (play || action === 'feed') && burst > 0 && burst < .69;
      if (!flash.visible) return;
      const angle = index * 2.399;
      const distance = Math.sqrt(burst) * (.40 + index % 4 * .14);
      const up = play ? .16 + 1.5 * burst - 1.58 * burst ** 2 : 1.24 + 1.44 * burst - 1.09 * burst ** 2;
      flash.position.set(sourceX + Math.cos(angle) * distance, up + .24 * distance * Math.sin(angle),
        sourceZ + Math.sin(angle) * distance * .30);
      flash.rotation.set(index, time * 4, angle + time * 3);
      flash.scale.setScalar((.045 + index % 3 * .023) * pulse(burst, 0, .19, .69));
    });
  }

  function updateWash(action, age, camera) {
    bubbles.forEach((bubble, index) => {
      const rise = age - .06 - index * .072;
      bubble.visible = action === 'wash' && rise >= 0 && rise < 1.13;
      if (!bubble.visible) return;
      const angle = index * 2.399 + rise * 4;
      const size = (.074 + index % 4 * .024) * pulse(rise, 0, .32, 1.13);
      const radius = .32 + rise * .44;
      bubble.position.set(.25 + Math.cos(angle) * radius, .37 + rise * 1.45 + (index % 3) * .13,
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

  return (action, age, camera, sleeping, time) => {
    if (action === 'feed') movesFruit(apple, age);
    else apple.visible = false;
    if (action === 'play') updateToy(age, camera);
    else for (const part of [toy, ring, ...echoes]) part.visible = false;
    if (action === 'pet') updateHearts(age, camera);
    else for (const love of hearts) love.visible = false;
    updateSparks(action, age);
    updateWash(action, age, camera);
    updateSleep(sleeping, time, camera);
  };
}

export function activeReaction(reaction, seconds, motion) {
  const age = reaction ? Math.max(0, seconds - reaction.at) : 0;
  return motion && age < (DURATIONS[reaction?.action] ?? 0) ? { action: reaction.action, age } : { age: 0 };
}
