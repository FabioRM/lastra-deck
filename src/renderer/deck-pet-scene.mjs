import * as THREE from '../../node_modules/three/build/three.module.js';
import { makeCompanion, poseCompanion } from './deck-pet-animals.mjs';
import { makeAtmosphere } from './deck-pet-atmosphere.mjs';
import { makeReactions } from './deck-pet-reactions.mjs';
import { addWorldDetails, surfaceDetail, WORLDS } from './deck-pet-worlds.mjs';
import { makeWorldInteraction } from './deck-pet-interaction.mjs';
import { makeWildlife } from './deck-pet-wildlife.mjs';
import { makePetWeather } from './deck-pet-weather.mjs';

const RIPPLE_RADII = [2.96, 3.29, 3.88, 4.48];
const LAYOUTS = {
  wide: { width: 1.62, scenery: 1.30, rx: 4.22, rz: 2.05, water: 1.42 },
  tall: { width: 1.09, scenery: 1.03, rx: 2.81, rz: 1.98, water: 1.04 },
};

function sculpt(scene) {
  const shapes = new Map();
  const materials = new Map();
  const resources = new Set();
  const builders = {
    ball: () => new THREE.SphereGeometry(1, 24, 16),
    facet: () => new THREE.IcosahedronGeometry(1, 0),
    foliage: () => new THREE.IcosahedronGeometry(1, 1),
    box: () => new THREE.BoxGeometry(1, 1, 1),
    ring: () => new THREE.TorusGeometry(1, .009, 6, 80),
    crystal: () => new THREE.CylinderGeometry(.68, 1, 1, 6, 1),
    cap: () => new THREE.ConeGeometry(.68, .36, 6),
    cone: () => new THREE.ConeGeometry(1, 1, 8),
    column: () => new THREE.CylinderGeometry(1, 1, 1, 12),
    disc: () => new THREE.PlaneGeometry(2, 2),
  };

  function geometry(key, build = builders[key]) {
    if (!shapes.has(key)) shapes.set(key, build());
    return shapes.get(key);
  }

  function material(color, style) {
    return custom(`${color}:${style}`, () => style === 'glow' ? new THREE.MeshBasicMaterial({ color })
      : new THREE.MeshStandardMaterial({ color, roughness: .69, flatShading: style === 'facet' }));
  }

  function custom(key, build) {
    if (!materials.has(key)) materials.set(key, build());
    return materials.get(key);
  }

  function track(resource) {
    resources.add(resource);
    return resource;
  }

  function mesh(parent, shape, color, position, scale, style) {
    const node = new THREE.Mesh(typeof shape === 'string' ? geometry(shape) : shape,
      typeof color === 'string' ? material(color, style) : color);
    node.position.set(...position);
    node.scale.set(...scale);
    parent.add(node);
    return node;
  }

  function group(parent, x = 0, y = 0, z = 0) {
    const node = new THREE.Group();
    node.position.set(x, y, z);
    parent.add(node);
    return node;
  }

  function radial(key, color, opacity, additive = false) {
    if (materials.has(key)) return materials.get(key);
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 64;
    const ink = canvas.getContext('2d');
    const gradient = ink.createRadialGradient(32, 32, 0, 32, 32, 32);
    gradient.addColorStop(0, '#fff');
    gradient.addColorStop(.28, '#fffb');
    gradient.addColorStop(.7, '#fff2');
    gradient.addColorStop(1, '#fff0');
    ink.fillStyle = gradient;
    ink.fillRect(0, 0, 64, 64);
    const map = track(new THREE.CanvasTexture(canvas));
    const result = new THREE.MeshBasicMaterial({ color, map, opacity, transparent: true, depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending });
    materials.set(key, result);
    return result;
  }

  // Bake repeated opaque scenery in its parent's coordinates. Moving branches can be batched
  // separately so their animation still carries all of the leaves or machinery.
  function batch(parent) {
    parent.updateWorldMatrix(true, true);
    const inverseParent = parent.matrixWorld.clone().invert();
    const bins = new Map();
    function collect(node) {
      if (!node.visible || node.userData.moving || node.isInstancedMesh) return;
      if (node.isMesh && !node.material.transparent && node.matrixWorld.determinant() > 0) {
        const key = `${node.geometry.id}:${node.material.id}`;
        if (!bins.has(key)) bins.set(key, []);
        bins.get(key).push(node);
      }
      for (const child of node.children) collect(child);
    }
    for (const child of parent.children) collect(child);
    for (const items of bins.values()) {
      if (items.length < 3) continue;
      const [{ geometry, material }] = items;
      const instances = track(new THREE.InstancedMesh(geometry, material, items.length));
      const matrix = new THREE.Matrix4();
      items.forEach((node, index) => {
        instances.setMatrixAt(index, matrix.multiplyMatrices(inverseParent, node.matrixWorld));
        node.removeFromParent();
      });
      instances.instanceMatrix.needsUpdate = true;
      parent.add(instances);
    }
  }

  function dispose() {
    scene.clear();
    for (const item of [...resources, ...shapes.values(), ...materials.values()]) item.dispose();
  }

  return { geometry, custom, mesh, group, radial, batch, track, dispose,
    link: (parent, shape, color, from, to, width) => connect({ mesh }, parent, shape, color, from, to, width) };
}

function connect({ mesh }, parent, shape, color, from, to, width) {
  const origin = new THREE.Vector3(...from);
  const direction = new THREE.Vector3(...to).sub(origin);
  const middle = origin.addScaledVector(direction, .5);
  const part = mesh(parent, shape, color, middle.toArray(), [width, direction.length(), width]);
  part.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
  return part;
}

function freezeIslandTransforms(node, movingParent = false) {
  const moving = node.userData.moving === true;
  if (!moving) node.matrixAutoUpdate = false;
  if (!moving && !movingParent) node.matrixWorldAutoUpdate = false;
  for (const child of node.children) freezeIslandTransforms(child, moving || movingParent);
}

function tree(model, island, x, z, size, colors, blossom) {
  const { group, mesh } = model;
  const crown = group(island, x, 0, z);
  crown.scale.setScalar(size);
  crown.rotation.y = x * 2;
  connect(model, crown, 'column', '#694b5d', [0, 0, 0], [.17, .98, .02], .09);
  if (blossom) {
    for (const [side, height, color] of [[-1, .85, 0], [0, 1.24, 1], [1, 1.03, 2]]) {
      connect(model, crown, 'column', '#694b5d', [.10, .5, 0], [side * .38, height, .02], .043);
      mesh(crown, 'foliage', colors[color], [side * .39, height + .11, .02], [.48, .33, .43], 'facet');
    }
  } else {
    for (let tier = 0; tier < 3; tier++) {
      const width = .53 - tier * .095;
      mesh(crown, 'cone', colors[tier], [.04, .57 + tier * .34, 0], [width, .78 - tier * .1, width], 'facet');
    }
  }
  model.batch(crown);
  crown.userData.moving = true;
  return crown;
}

function crystal(model, parent, x, z, size, color) {
  const { group, mesh } = model;
  const cluster = group(parent, x, 0, z);
  cluster.scale.setScalar(size);
  for (const [offset, height, tilt] of [[-.23, .47, .36], [0, .82, -.16], [.22, .36, -.49]]) {
    const piece = group(cluster, offset, 0, 0);
    piece.rotation.z = tilt;
    mesh(piece, 'crystal', color, [0, height * .5, 0], [.13, height, .13], 'facet');
    mesh(piece, 'cap', color, [0, height + .085, 0], [.13, .48, .13], 'facet');
  }
}

function coral(model, island, x, z, size, color) {
  const { group, mesh } = model;
  const plant = group(island, x, 0, z);
  plant.scale.setScalar(size);
  plant.rotation.y = x;
  for (const [tipX, tipY, tipZ] of [[-.46, .52, .02], [-.22, .78, -.05], [.12, .92, .03], [.42, .59, -.02], [.2, .51, .24]]) {
    const bend = [tipX * .7, tipY * .58, tipZ * .8];
    const tip = [tipX, tipY, tipZ];
    connect(model, plant, 'column', color, [0, .06, 0], bend, .067);
    connect(model, plant, 'column', color, bend, tip, .052);
    mesh(plant, 'ball', color, bend, [.065, .067, .065]);
    mesh(plant, 'ball', color, tip, [.053, .055, .053]);
  }
}

function lantern(model, island, x, z, size, color) {
  const { group, mesh, radial } = model;
  const stand = group(island, x, 0, z);
  stand.scale.setScalar(size);
  mesh(stand, 'column', '#7c5852', [0, .34, 0], [.042, .68, .042]);
  mesh(stand, 'box', '#63544f', [0, .56, 0], [.27, .065, .27]);
  mesh(stand, 'box', color, [0, .70, 0], [.195, .24, .195], 'glow');
  mesh(stand, 'cone', '#854f4c', [0, .87, 0], [.235, .18, .235]);
  mesh(stand, 'disc', radial('lantern glow', color, .50, true), [0, .70, .15], [.54, .54, 1]);
  for (const cornerX of [-.103, .103]) {
    for (const cornerZ of [-.103, .103]) {
      mesh(stand, 'box', '#6d4f48', [cornerX, .70, cornerZ], [.026, .30, .026]);
    }
  }
}

function terrain(model, scene, id, theme, random, layout) {
  const { geometry, mesh, group, radial } = model;
  const island = group(scene);
  const shell = group(island);
  shell.scale.x = layout.width;
  const scenery = group(island);
  const trees = [];
  scenery.scale.x = layout.scenery;
  const foundation = geometry('foundation', () => new THREE.LatheGeometry([
    [0, -.91], [1.44, -.91], [2.07, -.64], [2.55, -.39], [2.72, -.16], [2.62, -.07], [0, -.07],
  ].map(([x, y]) => new THREE.Vector2(x, y)), 14));
  const surface = geometry('surface', () => new THREE.LatheGeometry([
    [2.55, -.23], [2.73, -.14], [2.69, -.045], [2.55, 0], [0, 0],
  ].map(([x, y]) => new THREE.Vector2(x, y)), 28));
  mesh(shell, foundation, theme.soil, [0, 0, 0], [1, 1, .78], 'facet');
  mesh(shell, surface, theme.grass, [0, 0, 0], [1, 1, .78], 'facet');
  surfaceDetail(model, shell, id, theme);
  const shelf = geometry('stone strata', () => new THREE.LatheGeometry([
    [2.36, -.49], [2.45, -.45], [2.46, -.41], [2.42, -.395],
  ].map(([x, y]) => new THREE.Vector2(x, y)), 14));
  mesh(shell, shelf, theme.rim, [0, 0, 0], [1, 1, .78], 'facet');
  mesh(island, 'disc', radial('reflection', theme.accent, .35, true), [0, -.93, 0], [4.55 * layout.water, 3.05, 1]).rotation.x = -Math.PI / 2;
  mesh(shell, 'disc', radial('island shadow', '#050710', .83), [0, -.925, 0], [2.92, 2.0, 1]).rotation.x = -Math.PI / 2;
  const rings = RIPPLE_RADII.map((radius, index) => {
    const ring = mesh(island, 'ring', theme.accent, [0, -.92 - index * .007, 0], [radius, radius * .67, 1], 'glow');
    ring.material = model.track(ring.material.clone());
    ring.material.transparent = true;
    ring.material.depthWrite = false;
    ring.material.opacity = [.38, .23, .16, .08][index];
    ring.rotation.x = -Math.PI / 2;
    ring.userData.moving = true;
    return ring;
  });
  const fragments = layout.width > 1.2 ? 38 : 26;
  for (let index = 0; index < fragments; index++) {
    const angle = index * Math.PI * 2 / fragments;
    const size = .055 + random() * .17;
    const radius = 2.36 + random() * .18;
    mesh(island, 'facet', index % 3 ? theme.rim : theme.stone,
      [Math.cos(angle) * radius * layout.width, -.17 - random() * .27, Math.sin(angle) * radius * .78], [size * 1.6, size, size], 'facet');
  }
  for (let index = 0; index < 57; index++) {
    const x = (random() - .5) * 4.7;
    const z = (random() - .5) * 3.7;
    if (Math.hypot(x, z / .78) > 2.45 || (Math.abs(x - .17) < .72 && z > -.1)) continue;
    const size = .027 + random() * .065;
    mesh(island, 'foliage', index % 3 ? theme.plants[index % 3] : theme.accent, [x, size * .34, z],
      [size * 1.7, size * .72, size], 'facet');
  }
  for (let index = 0; index < 8; index++) {
    const z = index * .25 - .73;
    const x = -1.10 + Math.sin(index * .68) * .37;
    mesh(island, 'foliage', theme.stone, [x, .014, z], [.22 + random() * .10, .035, .14], 'facet').rotation.y = random() * 3;
  }

  if (id === 'tide') {
    for (const [x, z, size, shade] of [[-1.75, -.61, 1.3, 2], [-.95, -1.23, .91, 0], [.48, -1.36, 1.18, 2],
      [1.32, -1.02, 1.65, 1], [1.88, -.45, .85, 2], [-1.67, .81, .46, 1]]) {
      coral(model, scenery, x, z, size, theme.plants[shade]);
    }
    const star = group(scenery, 1.15, .045, 1.08);
    for (let point = 0; point < 5; point++) {
      const angle = point * Math.PI * 2 / 5;
      mesh(star, 'ball', '#e78d91', [.14 * Math.sin(angle), 0, .14 * Math.cos(angle)], [.055, .045, .15]).rotation.y = angle;
    }
  } else if (id === 'grove' || id === 'moon') {
    for (const [x, z, size] of [[-2.02, -.38, .93], [-1.54, -.96, 1.24], [-.72, -1.42, .82],
      [.48, -1.36, .92], [1.36, -.98, 1.33], [1.92, -.41, .82]]) {
      trees.push(tree(model, scenery, x, z, size, theme.plants, id === 'moon'));
    }
    if (id === 'moon') {
      crystal(model, scenery, -1.75, .55, .85, '#d1a7ff');
      crystal(model, scenery, 1.71, .54, 1.05, '#e8aadc');
      crystal(model, scenery, .92, -1.3, .66, '#d3c2ff');
    } else {
      lantern(model, scenery, -1.32, .66, .91, theme.light);
      lantern(model, scenery, 1.50, -.05, 1.08, theme.light);
      for (const [x, z, size] of [[-1.77, .40, .82], [-1.64, .52, .50], [1.37, .94, 1], [1.57, .79, .63], [.86, -.88, .76]]) {
        mesh(scenery, 'column', '#ffe0b0', [x, .105 * size, z], [.038 * size, .21 * size, .038 * size]);
        mesh(scenery, 'ball', '#e78972', [x, .205 * size, z], [.14 * size, .069 * size, .14 * size]);
        mesh(scenery, 'ball', '#ffefce', [x + .047 * size, .257 * size, z], [.024 * size, .016 * size, .025 * size]);
      }
    }
  }

  for (const side of [-1, 1]) {
    for (let index = 0; index < (layout.width > 1.2 ? 14 : 5); index++) {
      const angle = -.59 + index * .084;
      const distance = .78 + random() * .16;
      const x = side * layout.rx * Math.cos(angle) * distance;
      const z = layout.rz * Math.sin(angle) * distance;
      const size = .055 + random() * .11;
      mesh(island, 'foliage', index % 3 ? theme.plants[index % 3] : theme.stone,
        [x, .027, z], [size * 1.32, size * .58, size], 'facet');
    }
  }
  const animateDetails = addWorldDetails(model, scenery, id, theme);
  const shadow = mesh(island, 'disc', radial('pet shadow', '#192630', .72), [.25, .057, .55], [.84, .58, 1]);
  shadow.rotation.x = -Math.PI / 2;
  shadow.userData.moving = true;
  model.batch(island);
  island.updateWorldMatrix(true, true);
  freezeIslandTransforms(island);
  return { rings, shadow, animate(time, wind) {
    animateDetails(time);
    for (const [index, crown] of trees.entries()) {
      crown.rotation.z = Math.sin(time * (1.16 + wind * .96) + index * .73) * (.027 + wind * .086) + wind * .065;
    }
  } };
}

export function createPetScene(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'low-power' });
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, .1, 60);
  renderer.setClearColor(0x000000, 0);
  renderer.toneMapping = THREE.NeutralToneMapping;
  let scene;
  let model;
  let pet;
  let ground;
  let atmosphere;
  let paintWeather;
  let lights;
  let props;
  let propLayer;
  let interaction;
  let wildlife;
  let previousReaction;
  let previousTime;
  let ambientTime = 0;
  let visibleHeight = 5.1;
  let tall = false;
  let currentSettings;
  let lastWidth;
  let lastHeight;
  let pixelRatio = 1;

  function setWorld(settings, retainReaction = false) {
    currentSettings = settings;
    model?.dispose();
    scene = new THREE.Scene();
    model = sculpt(scene);
    const theme = WORLDS[settings.habitat];
    const sun = new THREE.DirectionalLight(settings.habitat === 'oasis' ? '#ffdbb0' : '#fff1e3', 2.55);
    sun.position.set(-3, 6, 5);
    const rim = new THREE.DirectionalLight(theme.accent, 2.30);
    rim.position.set(3, 4, -5);
    const fill = new THREE.DirectionalLight(theme.sky, .55);
    fill.position.set(5, 1.4, 6);
    const ambient = new THREE.HemisphereLight(theme.sky, '#60526f', 1.85);
    scene.add(ambient, sun, rim, fill);
    lights = { sun, ambient, rim };
    let seed = theme.seed;
    const random = () => ((seed = (Math.imul(1664525, seed) + 1013904223) >>> 0) / 2 ** 32);
    const layout = tall ? LAYOUTS.tall : LAYOUTS.wide;
    ground = terrain(model, scene, settings.habitat, theme, random, layout);
    atmosphere = makeAtmosphere(model, scene, settings.habitat, theme, random, tall);
    pet = makeCompanion(model, scene, settings.species);
    propLayer = model.group(scene);
    props = makeReactions(model, propLayer, theme);
    interaction = makeWorldInteraction(model, scene, settings.habitat, theme, layout);
    wildlife = makeWildlife(model, scene, settings.habitat, theme, layout, interaction.features);
    paintWeather = makePetWeather(model, scene, random, layout);
    if (!retainReaction) previousReaction = undefined;
    previousTime = undefined;
    ambientTime = 0;
  }

  function resize(width, height) {
    const ratio = Math.min(window.devicePixelRatio, Math.sqrt(1_500_000 / (width * height)));
    if (width === lastWidth && height === lastHeight && ratio === pixelRatio) return;
    lastWidth = width;
    lastHeight = height;
    const aspect = width / height;
    const changed = tall !== (aspect < .82);
    tall = aspect < .82;
    const halfHeight = Math.max(2.25, (tall ? 3.15 : 4.75) / aspect);
    visibleHeight = halfHeight * 2;
    const halfWidth = halfHeight * aspect;
    camera.left = -halfWidth;
    camera.right = halfWidth;
    camera.top = halfHeight;
    camera.bottom = -halfHeight;
    camera.updateProjectionMatrix();
    if (ratio !== pixelRatio) {
      pixelRatio = ratio;
      renderer.setPixelRatio(ratio);
    }
    renderer.setSize(width, height, false);
    if (changed && currentSettings) setWorld(currentSettings, true);
  }

  function pause() { previousTime = undefined; }

  function draw(seconds, motion, reaction, sleeping = false, needs, emotion, climate) {
    if (!scene) return;
    if (motion && previousTime !== undefined) ambientTime += Math.min(.08, Math.max(0, seconds - previousTime));
    previousTime = seconds;
    const time = motion ? ambientTime : 0;
    camera.position.set((tall ? 2.55 : 2.40) + Math.sin(time * .23) * .31, 4.07 + Math.sin(time * .29) * .11, 9.6);
    camera.lookAt(0, .79, 0);
    const pixelsPerUnit = canvas.height / visibleHeight;
    const { cloud, wind, flash, haze } = paintWeather(climate, time, motion, camera, pixelsPerUnit);
    const night = climate?.phase === 'night';
    const twilight = climate?.phase === 'dawn' || climate?.phase === 'dusk';
    lights.sun.intensity = (night ? 1.27 : twilight ? 1.92 : 2.55) * (1 - cloud * .36) + flash * .75;
    lights.ambient.intensity = (night ? 1.48 : 1.85) * (1 - haze * .17);
    lights.rim.intensity = (night ? 2.60 : 2.30) + flash * .45;
    if (reaction && reaction !== previousReaction) interaction.react(reaction, time, motion, needs);
    previousReaction = reaction;
    const movement = interaction.update(time, motion, sleeping, needs, camera, atmosphere, wildlife);
    const { clip, age, action } = movement;
    poseCompanion(pet, time, motion, clip, age, movement, needs, emotion);
    ground.shadow.material.opacity = .77 - pet.root.position.y * .62;
    ground.shadow.position.x = pet.root.position.x;
    ground.shadow.position.z = pet.root.position.z;
    ground.rings.forEach((ring, index) => {
      const wave = Math.sin(time * 1.05 - index * 1.06);
      const radius = RIPPLE_RADII[index] * (1 + wave * .027);
      ring.scale.set(radius * (tall ? LAYOUTS.tall.water : LAYOUTS.wide.water), radius * .67, 1);
      ring.material.opacity = [.32, .21, .15, .074][index] * (.79 + wave * .21);
    });
    ground.animate(time, wind);
    wildlife.paint(time, motion, movement);
    atmosphere.paint(time, camera, pixelsPerUnit, movement.skyPulse, climate, cloud);
    propLayer.position.set(movement.x - .25, 0, movement.z - .57);
    props(motion ? clip : undefined, age, camera, sleeping, time, action);
    renderer.render(scene, camera);
    return movement.effect;
  }

  function pick(clientX, clientY) {
    if (!interaction) return null;
    const { left, top, width, height } = canvas.getBoundingClientRect();
    if (width < 1 || height < 1) return null;
    return interaction.pick((clientX - left) / width, (clientY - top) / height, camera, pet, atmosphere, wildlife);
  }

  function walk(point, motion, needs) {
    interaction.walk(point, ambientTime, motion, { marker: true, needs, care: 'explore', automatic: false });
  }

  return { setWorld, resize, draw, pause, pick, walk, skyLabel: () => atmosphere.label };
}
