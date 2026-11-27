import * as THREE from '../../node_modules/three/build/three.module.js';
import { makeCyberScenery } from './deck-pet-cyber.mjs';

export const WORLDS = {
  grove: { seed: 2081, grass: '#5c9c76', rim: '#345f50', soil: '#31504a', stone: '#688b81',
    plants: ['#315f56', '#42896c', '#79b486'], light: '#fff2ac', sky: '#c6efe1', accent: '#ffd486', air: 'firefly' },
  moon: { seed: 6033, grass: '#8674b2', rim: '#584978', soil: '#372e58', stone: '#a696c8',
    plants: ['#654f9a', '#ad82cb', '#eda7d6'], light: '#ffd9f4', sky: '#e5d7ff', accent: '#c29cff', air: 'petal' },
  tide: { seed: 7411, grass: '#d7b98c', rim: '#587e8a', soil: '#2d5672', stone: '#88b8bf',
    plants: ['#297e89', '#4dbba8', '#ed929f'], light: '#dcfff1', sky: '#bce5ff', accent: '#73ead9', air: 'bubble' },
  aurora: { seed: 4013, grass: '#c5e3ef', rim: '#7395b6', soil: '#39506c', stone: '#97b9d2',
    plants: ['#42738b', '#78acc2', '#d5edf7'], light: '#b8ffe7', sky: '#c7e6ff', accent: '#67efc8', air: 'snow' },
  oasis: { seed: 2009, grass: '#d2a371', rim: '#a76864', soil: '#8e555d', stone: '#c88768',
    plants: ['#467b73', '#8ba669', '#eab575'], light: '#ffe1a0', sky: '#ffceb6', accent: '#ffbf70', air: 'sand' },
  orbit: { seed: 8617, grass: '#6f79a4', rim: '#4b507d', soil: '#333658', stone: '#8994ce',
    plants: ['#525695', '#8c79c6', '#a9bded'], light: '#a6e3ff', sky: '#cfccff', accent: '#7dcaf6', air: 'dust' },
  neon: { seed: 1047, grass: '#686383', rim: '#4e3d64', soil: '#382849', stone: '#9286a5',
    plants: ['#65477f', '#a261a5', '#73d4ec'], light: '#ffd3ef', sky: '#e5bdf5', accent: '#fb75c6', air: 'rain' },
  cyber: { seed: 7209, grass: '#60908c', rim: '#365961', soil: '#213f50', stone: '#8bb1a6',
    plants: ['#3e9c8c', '#71bf9f', '#a2dcb6'], light: '#b5ffdb', sky: '#bfeeff', accent: '#71f8c2', air: 'bubble' },
};

function ringsAround(model, parent, x, y, z, color, size) {
  const ring = model.mesh(parent, 'ring', color, [x, y, z], [size, size, .75], 'glow');
  ring.rotation.x = -Math.PI / 2;
  return ring;
}

function groundLight(model, parent, name, color, [x, y, z], width, length, opacity) {
  const light = model.mesh(parent, 'disc', model.radial(name, color, opacity, true), [x, y, z], [width, length, 1]);
  light.rotation.x = -Math.PI / 2;
}

export function surfaceDetail(model, island, habitat, theme) {
  const material = model.track(new THREE.ShaderMaterial({
    depthWrite: false, transparent: true,
    uniforms: {
      pale: { value: new THREE.Color(theme.light) }, dark: { value: new THREE.Color(theme.soil) },
      drifts: { value: habitat === 'oasis' || habitat === 'aurora' ? 1 : 0 },
    },
    vertexShader: `
      varying vec2 tile;
      void main() {
        tile = position.xy;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `
      uniform vec3 pale;
      uniform vec3 dark;
      uniform float drifts;
      varying vec2 tile;
      float grain(vec2 cell) {
        return fract(sin(dot(cell, vec2(127.1, 311.7))) * 43758.5453);
      }
      void main() {
        float edge = 1.0 - smoothstep(0.83, 0.999, length(tile));
        vec2 st = tile * 33.0;
        float fleck = grain(floor(st));
        float specks = step(0.74, fleck) * (1.0 - smoothstep(0.10, 0.46, length(fract(st) - 0.5)));
        float broad = sin(tile.x * 12.0 + tile.y * 8.0) * sin(tile.y * 17.0 - tile.x * 6.0);
        float dune = sin(73.0 * tile.y + 6.2 * sin(tile.x * 3.3) + broad * 0.54);
        float shade = broad * 0.16 + dune * 0.24 * drifts + (fleck - 0.42) * specks;
        gl_FragColor = vec4(mix(dark, pale, smoothstep(-0.17, 0.31, shade)), edge * abs(shade) * 0.29);
        #include <colorspace_fragment>
      }`,
  }));
  const detail = model.mesh(island, 'disc', material, [0, .006, 0], [2.67, 2.08, 1]);
  detail.rotation.x = -Math.PI / 2;
}

function sprigs(model, island, [x, z, scale], colors) {
  const plant = model.group(island, x, .01, z);
  plant.rotation.y = x * 3;
  plant.scale.setScalar(scale);
  for (let blade = 0; blade < 5; blade++) {
    const angle = blade * 2.399;
    const spray = model.group(plant);
    spray.rotation.y = angle;
    const height = .26 + blade * .065;
    const leaf = model.mesh(spray, 'foliage', colors[blade % colors.length], [.09, height * .47, 0], [.062, height * .58, .043]);
    leaf.rotation.z = -.44;
    model.mesh(spray, 'facet', colors[(blade + 1) % colors.length], [.184, height * .90, 0], [.065, .13, .036]).rotation.z = -.46;
  }
  return plant;
}

function meadow(model, island, colors, points) {
  return points.map((point) => sprigs(model, island, point, colors));
}

function blossom(model, island, x, z, size, color) {
  const stem = model.group(island, x, 0, z);
  stem.scale.setScalar(size);
  model.mesh(stem, 'column', '#638880', [0, .14, 0], [.019, .28, .019]);
  for (let number = 0; number < 5; number++) {
    const angle = number * Math.PI * 2 / 5;
    const petal = model.mesh(stem, 'ball', color, [.082 * Math.sin(angle), .285, .082 * Math.cos(angle)], [.056, .025, .087]);
    petal.rotation.y = angle;
    petal.rotation.x = .21;
  }
  model.mesh(stem, 'ball', '#ffe8ad', [0, .309, 0], [.046, .028, .046], 'glow');
}

function pool(model, island, id, x, z, rx, rz) {
  const basin = model.group(island, x, 0, z);
  basin.rotation.y = -.34;
  const stone = id === 'oasis' ? '#b47c62' : '#8f9e9d';
  model.mesh(basin, 'ball', stone, [0, .018, 0], [rx + .075, .026, rz + .075]);
  model.mesh(basin, 'ball', '#2c756f', [0, .024, 0], [rx, .023, rz]);
  model.mesh(basin, 'ball', '#539d87', [.06, .035, -.025], [rx * .85, .017, rz * .75]);
  groundLight(model, basin, 'pool sheen', '#9bf8d2', [0, .055, 0], rx, rz, .34);
  const material = model.track(new THREE.MeshBasicMaterial({ color: '#b6f8d7', opacity: .6, transparent: true, depthWrite: false }));
  const waves = [0, 1, 2].map(() => ringsAround(model, basin, 0, .055, 0, material, 1));
  return (time) => {
    for (const [index, wave] of waves.entries()) {
      const fraction = (index * .30 + time * .32) % 1;
      const size = .2 + fraction * .73;
      wave.scale.set(rx * size, rz * size, .26);
    }
  };
}

function palms(model, island, [x, z, size], update) {
  const trunk = model.group(island, x, 0, z);
  trunk.scale.setScalar(size);
  const points = [[0, 0, 0], [.016, .35, 0], [.09, .68, -.016], [.23, 1.05, -.03], [.36, 1.39, -.055]];
  for (let i = 1; i < points.length; i++) {
    model.link(trunk, 'column', i % 2 ? '#9d6a5f' : '#ba8569', points[i - 1], points[i], .107 - i * .011);
    const joint = points[i - 1];
    model.mesh(trunk, 'ball', '#d69a70', joint, [.101 - i * .011, .042, .100 - i * .011]);
  }
  const crown = model.group(trunk, ...points.at(-1));
  for (let leaf = 0; leaf < 7; leaf++) {
    const stem = model.group(crown);
    stem.rotation.y = leaf * Math.PI * 2 / 7;
    const lift = leaf % 2 * .17;
    const color = leaf % 2 ? '#82a66b' : '#3f7f70';
    model.link(stem, 'column', color, [0, 0, 0], [.76, lift, 0], .026);
    for (let blade = 0; blade < 4; blade++) {
      for (const side of [-1, 1]) {
        const pinna = model.mesh(stem, 'foliage', color, [.21 + blade * .151, .035 + lift * blade * .17, side * .087],
          [.152 - blade * .017, .035, .139 - blade * .018], 'facet');
        pinna.rotation.y = side * -.42;
        pinna.rotation.z = .11 - blade * .065;
      }
    }
  }
  for (const side of [-1, 1]) model.mesh(crown, 'ball', '#b57f54', [.039, -.080, side * .10], [.083, .097, .081]);
  model.batch(crown);
  update.push((time) => { crown.rotation.z = Math.sin(time * 1.6 + x) * .064; });
  crown.userData.moving = true;
}

function summit(model, island, x, z, height, radius, angle) {
  const mountain = model.group(island, x, 0, z);
  mountain.rotation.y = angle;
  const geometry = model.geometry('snowy mountain', () => {
    const rings = [[1, 0], [.79, .43], [.42, .68], [.176, .91], [0, 1]];
    const sides = 7;
    const vertices = [];
    const shade = [];
    const tones = ['#5a7896', '#7999b2', '#b4d3e8', '#edf7ff'].map((color) => new THREE.Color(color));
    function point(tier, side) {
      const [size, y] = rings[tier];
      const angle = side * Math.PI * 2 / sides + (tier % 2) * .125;
      const ridge = .82 + .22 * Math.sin(side * 4.3 + tier * 1.7);
      return [Math.cos(angle) * size * ridge - y * .19,
        y + (tier === 2 ? Math.sin(side * 2.8) * .07 : 0), Math.sin(angle) * size * ridge + y * .17];
    }
    for (let tier = 0; tier < rings.length - 1; tier++) {
      for (let side = 0; side < sides; side++) {
        for (const [ring, edge] of [[tier, side], [tier + 1, side], [tier, side + 1],
          [tier + 1, side], [tier + 1, side + 1], [tier, side + 1]]) {
          vertices.push(...point(ring, edge % sides));
          const color = tones[tier].clone().multiplyScalar(.91 + .12 * Math.sin(side * 3.2 + tier));
          shade.push(color.r, color.g, color.b);
        }
      }
    }
    const result = new THREE.BufferGeometry();
    result.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    result.setAttribute('color', new THREE.Float32BufferAttribute(shade, 3));
    result.computeVertexNormals();
    return result;
  });
  const snow = model.custom('snow faces', () => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .90 }));
  model.mesh(mountain, geometry, snow, [0, 0, 0], [radius, height, radius * .83]);
}

function icyNeedles(model, island, x, z, size, theme) {
  const cluster = model.group(island, x, .015, z);
  cluster.scale.setScalar(size);
  for (const [dx, height, tilt] of [[-.19, .45, .42], [0, .78, -.14], [.22, .51, -.5]]) {
    const stand = model.group(cluster, dx);
    stand.rotation.z = tilt;
    model.mesh(stand, 'crystal', theme.light, [0, height * .46, 0], [.126, height, .126], 'facet');
    model.mesh(stand, 'cap', '#d7f6f8', [0, height + .035, 0], [.126, .40, .126], 'facet');
  }
  groundLight(model, cluster, 'ice reflection', theme.accent, [0, .013, 0], .52, .38, .47);
}

function telescope(model, island, color, update) {
  const stand = model.group(island, 1.37, 0, -.58);
  for (const point of [[-.26, .02, .17], [.23, .02, .17], [0, .02, -.245]]) {
    model.link(stand, 'column', '#4b5180', point, [0, .51, 0], .044);
  }
  const dish = model.group(stand, 0, .55, 0);
  dish.rotation.set(-.30, .15, -.88);
  const bowl = model.geometry('telescope dish', () => new THREE.LatheGeometry([
    [0, -.086], [.15, -.061], [.24, -.017], [.31, .068], [.29, .070], [.23, .010], [.14, -.017], [0, -.035],
  ].map(([x, y]) => new THREE.Vector2(x, y)), 22));
  model.mesh(dish, bowl, '#bcc5ee', [0, 0, 0], [1, 1, 1]);
  model.link(dish, 'column', '#687fb4', [0, -.04, 0], [0, .215, 0], .025);
  model.mesh(dish, 'ball', color, [0, .228, 0], [.053, .067, .053], 'glow');
  dish.userData.moving = true;
  update.push((time) => {
    dish.rotation.y = .16 + Math.sin(time * .42) * .32;
    dish.rotation.z = -.88 + Math.sin(time * .71) * .11;
  });
}

export function addWorldDetails(model, island, habitat, theme) {
  const { group, mesh, link } = model;
  const updates = [];
  if (habitat === 'neon' || habitat === 'cyber') {
    return makeCyberScenery(model, island, habitat, theme);
  } else if (habitat === 'aurora') {
    for (const [x, z, height, width, rotation] of [[-1.6, -.81, 1.68, .68, .28], [-.89, -1.25, 2.09, .71, -.23],
      [.41, -1.50, 1.38, .67, .38], [1.30, -.92, 1.87, .89, 1.4], [1.76, -.41, 1.03, .58, -.25]]) {
      summit(model, island, x, z, height, width, rotation);
    }
    icyNeedles(model, island, -1.71, .52, .81, theme);
    icyNeedles(model, island, 1.48, .66, 1.05, theme);
    icyNeedles(model, island, .88, -1.1, .51, theme);
    for (const [x, z, size] of [[-1.2, 1.25, .33], [-.55, 1.48, .21], [1.54, .83, .30], [1.85, .36, .23]]) {
      mesh(island, 'foliage', '#edf8ff', [x, .043, z], [size, size * .33, size * .50], 'facet');
    }
  } else if (habitat === 'oasis') {
    palms(model, island, [-1.69, -.61, 1.08], updates);
    palms(model, island, [1.30, -.92, 1.44], updates);
    palms(model, island, [1.89, -.43, .90], updates);
    updates.push(pool(model, island, habitat, -1.03, .72, .56, .42));
    const arch = group(island, -1.23, 0, -.91);
    arch.rotation.y = .18;
    for (const side of [-1, 1]) {
      for (let tier = 0; tier < 3; tier++) {
        mesh(arch, 'box', tier % 2 ? '#c49174' : '#b47f72', [side * .37, .115 + tier * .21, 0],
          [.255 - tier * .022, .197, .272]).rotation.y = side * tier * .12;
      }
    }
    const stones = model.geometry('arch stones', () => new THREE.TorusGeometry(.365, .093, 6, 18, Math.PI));
    mesh(arch, stones, '#d9a582', [0, .57, 0], [1, .93, 1.42], 'facet');
    for (const [x, z, size] of [[-1.86, .31, .22], [-1.52, 1.10, .11], [-.78, 1.16, .13], [1.95, .18, .18]]) {
      mesh(island, 'foliage', '#eaad85', [x, .021, z], [size * 1.3, size * .38, size * .67], 'facet');
    }
    const cactus = group(island, 1.57, 0, .56);
    mesh(cactus, 'ball', '#568a76', [0, .37, 0], [.151, .422, .138]);
    for (const side of [-1, 1]) {
      link(cactus, 'column', '#699b7a', [0, .20, 0], [side * .206, .37 + side * .052, 0], .066);
      mesh(cactus, 'ball', '#739d76', [side * .206, .40 + side * .052, 0], [.078, .154, .069]);
    }
    blossom(model, island, 1.62, .66, .76, '#ffd49a');
  } else if (habitat === 'orbit') {
    const pad = group(island, .25, 0, .57);
    mesh(pad, 'ball', '#474867', [0, .015, 0], [1.23, .023, .83]);
    const ring = ringsAround(model, pad, 0, .04, 0, theme.light, 1.17);
    ring.scale.y = .77;
    for (let index = 0; index < 15; index++) {
      const angle = index * Math.PI * 2 / 15;
      mesh(pad, 'box', index % 3 ? '#797fb6' : theme.accent, [1.11 * Math.sin(angle), .047, .73 * Math.cos(angle)],
        [.034, .018, .047], index % 3 ? undefined : 'glow').rotation.y = angle;
    }
    telescope(model, island, '#95e8ff', updates);
    icyNeedles(model, island, -1.73, -.08, 1.19, { ...theme, light: '#b4a5ec' });
    icyNeedles(model, island, 1.71, .56, .67, theme);
    for (const [x, z, size] of [[-.95, -1.21, .72], [.18, -1.43, 1.15], [1.76, -.76, .91]]) {
      const marker = group(island, x, 0, z);
      marker.scale.setScalar(size);
      mesh(marker, 'column', '#575e8d', [0, .18, 0], [.084, .36, .084]);
      mesh(marker, 'disc', model.radial('beacon halo', '#91e2ff', .42, true), [0, .45, .054], [.32, .32, 1]);
      mesh(marker, 'facet', '#9be8ff', [0, .45, 0], [.096, .138, .096], 'glow').rotation.z = .35;
    }
  } else if (habitat === 'tide') {
    updates.push(pool(model, island, habitat, -1.18, .68, .49, .36));
    const reeds = meadow(model, island, ['#49a998', '#8fc5a1', '#57bbe1'],
      [[-1.91, .38, .81], [1.51, .83, .56], [1.84, .17, .83], [1.65, -.68, 1.05], [-1.31, -1.22, .75]]);
    for (const [index, reed] of reeds.entries()) {
      model.batch(reed);
      reed.userData.moving = true;
      updates.push((time) => { reed.rotation.z = .13 * Math.sin(time * 1.61 + index * 1.32); });
    }
  } else {
    const moon = habitat === 'moon';
    const colors = moon ? ['#8675b9', '#c895cb', '#d9adf0'] : ['#519279', '#6fa780', '#a6c374'];
    meadow(model, island, colors, [[-1.90, .14, .72], [-1.55, .80, .67], [-.70, 1.33, .38], [.98, 1.25, .48],
      [1.50, .87, .57], [1.94, .23, .83], [1.59, -.70, .76], [-2.11, -.27, .65]]);
    for (const [x, z, size] of [[-1.24, .84, .65], [-.81, 1.27, .50], [1.45, 1.00, .8], [1.89, .26, .71]]) {
      blossom(model, island, x, z, size, moon ? '#fad4f4' : '#f9d47d');
    }
    if (!moon) {
      groundLight(model, island, 'lantern pool', '#ffc472', [-1.32, .028, .66], .53, .48, .28);
      groundLight(model, island, 'lantern pool', '#ffc472', [1.5, .028, -.05], .53, .48, .28);
      const glow = model.radial('lantern glow', theme.light, .50, true);
      const poolGlow = model.radial('lantern pool', '#ffc472', .28, true);
      updates.push((time) => {
        const shimmer = Math.sin(time * 7.9) * .032 + Math.sin(time * 12.8) * .018 + Math.sin(time * 3.1) * .045;
        glow.opacity = .50 + shimmer;
        poolGlow.opacity = .28 + shimmer * .55;
      });
    }
  }
  return (time) => { for (const animate of updates) animate(time); };
}
