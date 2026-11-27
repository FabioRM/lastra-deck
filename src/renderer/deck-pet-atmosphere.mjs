import * as THREE from '../../node_modules/three/build/three.module.js';

const AIR = {
  firefly: { count: 28, size: .14, drift: [.40, .23], shape: 1, color: '#ffe598' },
  petal: { count: 36, size: .085, drift: [.23, -.39], shape: 2, color: '#ffbce6' },
  bubble: { count: 29, size: .16, drift: [.22, .46], shape: 3, color: '#a0ffeb' },
  snow: { count: 54, size: .073, drift: [.18, -.36], shape: 1, color: '#e8fdff' },
  sand: { count: 35, size: .085, drift: [.65, .09], shape: 2, color: '#ffcf94' },
  dust: { count: 29, size: .105, drift: [.21, .15], shape: 0, color: '#b6e9ff' },
  rain: { count: 47, size: .13, drift: [-.22, -1.26], shape: 4, color: '#b4e6ff' },
};

export function particleField(model, scene, random, settings, distant = false) {
  const { count, size, drift, shape, color } = settings;
  const origins = [];
  const seeds = [];
  for (let index = 0; index < count; index++) {
    origins.push((random() - .5) * (distant ? 18 : 9.5), (random() - .32) * (distant ? 10 : 5.4),
      distant ? -4.0 - random() * 2 : .3 + random() * 3.7);
    seeds.push(random() * Math.PI * 2, size * (.35 + .78 * random()));
  }
  const geometry = model.track(new THREE.BufferGeometry());
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(origins, 3));
  geometry.setAttribute('seed', new THREE.Float32BufferAttribute(seeds, 2));
  const material = model.track(new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    blending: shape === 2 || shape === 3 ? THREE.NormalBlending : THREE.AdditiveBlending,
    uniforms: {
      seconds: { value: 0 }, pixelsPerUnit: { value: 100 }, drift: { value: new THREE.Vector2(...drift) },
      tint: { value: new THREE.Color(color) }, shape: { value: shape }, isDistant: { value: distant ? 1 : 0 },
      density: { value: 1 },
    },
    vertexShader: `
      uniform float seconds;
      uniform float pixelsPerUnit;
      uniform float isDistant;
      uniform vec2 drift;
      attribute vec2 seed;
      varying float shine;
      varying float spin;
      void main() {
        float phase = seed.x + seconds * 0.8;
        vec3 p = position;
        if (isDistant < 0.5) {
          p.xy += drift * seconds + vec2(sin(phase) * 0.27, cos(phase * 0.76) * 0.22);
          p.x = mod(p.x + 4.75, 9.5) - 4.75;
          p.y = mod(p.y + 1.73, 5.4) - 1.73;
        }
        spin = phase;
        shine = 0.45 + 0.54 * pow(0.5 + 0.5 * sin(phase * 1.35), 2.0);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
        gl_PointSize = max(1.4, pixelsPerUnit * seed.y);
      }`,
    fragmentShader: `
      uniform vec3 tint;
      uniform float shape;
      uniform float isDistant;
      uniform float density;
      varying float shine;
      varying float spin;
      void main() {
        vec2 p = (gl_PointCoord - 0.5) * 2.0;
        float radius = length(p);
        float glow = (1.0 - smoothstep(0.08, 1.0, radius)) * 0.55;
        float core = 1.0 - smoothstep(0.08, 0.37, radius);
        float alpha = glow + 0.5 * core;
        if (shape < 0.5) {
          float arms = (1.0 - smoothstep(0.03, 0.20, min(abs(p.x), abs(p.y)))) * (1.0 - radius);
          alpha = max(glow, arms * 0.82);
        } else if (shape > 1.5 && shape < 2.5) {
          mat2 turn = mat2(cos(spin), sin(spin), -sin(spin), cos(spin));
          alpha = 0.78 * (1.0 - smoothstep(0.47, 0.94, length((turn * p) * vec2(1.0, 1.95))));
        } else if (shape > 3.5) {
          alpha = 0.58 * (1.0 - smoothstep(0.045, 0.16, abs(p.x + 0.24 * p.y)))
            * (1.0 - smoothstep(0.22, 0.99, abs(p.y)));
        } else if (shape > 2.5) {
          float rim = smoothstep(0.58, 0.78, radius) * (1.0 - smoothstep(0.82, 0.99, radius));
          float gleam = 1.0 - smoothstep(0.08, 0.25, distance(p, vec2(-0.43, -0.42)));
          alpha = rim * 0.55 + gleam * 0.57 + glow * 0.11;
        }
        gl_FragColor = vec4(mix(tint, vec3(1.0), clamp(core * 0.46, 0.0, 0.7)),
          max(0.0, alpha) * shine * mix(0.91, 0.68, isDistant) * density);
        #include <colorspace_fragment>
      }`,
  }));
  const field = new THREE.Points(geometry, material);
  field.frustumCulled = false;
  scene.add(field);
  return (time, scale, density = 1) => {
    field.visible = density > 0;
    material.uniforms.seconds.value = time;
    material.uniforms.pixelsPerUnit.value = scale;
    material.uniforms.density.value = density;
  };
}

function aurora(model, scene) {
  const { group, geometry, mesh } = model;
  const curtain = group(scene, -.02, 1.87, -2.7);
  const grid = geometry('aurora fabric', () => new THREE.PlaneGeometry(7.45, 1.5, 88, 10));
  const bands = [[-.12, '#58f2c1', '#83d8ff'], [.22, '#8bd3fc', '#b095ff']].map(([offset, green, violet], index) => {
    const material = model.track(new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
      uniforms: {
        seconds: { value: 0 }, shift: { value: index * 2.2 }, foot: { value: new THREE.Color(green) },
        tip: { value: new THREE.Color(violet) },
      },
      vertexShader: `
        uniform float seconds;
        uniform float shift;
        varying vec2 cloth;
        void main() {
          cloth = uv;
          vec3 p = position;
          float x = p.x;
          float wave = x * 1.75 + seconds * 0.52 + shift;
          p.y += sin(wave) * 0.27 + cos(x * 0.66 - seconds * 0.33) * 0.31;
          p.y += (1.0 - cos(x * 0.63)) * 0.38 - 0.15;
          p.z += cos(wave * 1.27) * (0.37 + uv.y * 0.24);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
        }`,
      fragmentShader: `
        uniform float seconds;
        uniform float shift;
        uniform vec3 foot;
        uniform vec3 tip;
        varying vec2 cloth;
        void main() {
          float taper = smoothstep(0.02, 0.20, cloth.x) * (1.0 - smoothstep(0.79, 0.99, cloth.x));
          float pleat = 0.56 + 0.36 * sin(cloth.x * 77.0 + sin(cloth.x * 19.0 + seconds * 0.55 + shift) * 4.0);
          float hem = smoothstep(0.015, 0.15, cloth.y);
          float height = hem * pow(1.0 - cloth.y, 2.3);
          vec3 ink = mix(foot, tip, smoothstep(0.18, 0.91, cloth.y));
          gl_FragColor = vec4(ink, taper * height * pleat * 0.59);
          #include <colorspace_fragment>
        }`,
    }));
    mesh(curtain, grid, material, [0, offset, index * .16], [1, 1, 1]);
    return material;
  });
  return (time) => { for (const band of bands) band.uniforms.seconds.value = time; };
}

function orbitalSky(model, scene, halo) {
  const { group, geometry, mesh } = model;
  const planet = group(halo);
  planet.rotation.z = -.30;
  const material = model.track(new THREE.ShaderMaterial({
    uniforms: { seconds: { value: 0 } },
    vertexShader: `
      varying vec3 body;
      void main() {
        body = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `
      uniform float seconds;
      varying vec3 body;
      void main() {
        vec3 n = normalize(body);
        float cloud = 0.5 + 0.48 * sin(n.y * 17.0 + sin(n.x * 3.4 + seconds * 0.20) * 0.78 + n.z * 0.64);
        float sun = 0.22 + 0.75 * max(0.0, dot(n, normalize(vec3(-0.57, 0.56, 0.61))));
        float rim = pow(1.0 - max(n.z, 0.0), 2.2);
        vec3 ink = mix(vec3(0.26, 0.24, 0.59), vec3(0.73, 0.65, 0.89), cloud) * sun;
        gl_FragColor = vec4(ink + vec3(0.32, 0.54, 0.75) * rim * 0.38, 1.0);
        #include <colorspace_fragment>
      }`,
  }));
  mesh(planet, 'ball', material, [0, 0, 0], [.535, .535, .535]);
  const band = geometry('planet rings', () => new THREE.RingGeometry(.61, 1.03, 64));
  const ringShader = model.track(new THREE.ShaderMaterial({
    transparent: true, side: THREE.DoubleSide, depthWrite: false,
    vertexShader: `
      varying float band;
      void main() {
        band = length(position.xy);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `
      varying float band;
      void main() {
        float edge = smoothstep(0.61, 0.68, band) * (1.0 - smoothstep(0.98, 1.03, band));
        float stripe = 0.16 + 0.55 * (0.5 + 0.5 * sin(band * 87.0));
        gl_FragColor = vec4(0.67, 0.63, 0.94, stripe * edge);
        #include <colorspace_fragment>
      }`,
  }));
  mesh(planet, band, ringShader, [0, 0, 0], [1, 1, 1]).rotation.x = 1.28;
  const satellite = group(scene);
  mesh(satellite, 'facet', '#d0d7f1', [0, 0, 0], [.107, .114, .113], 'facet');
  mesh(satellite, 'box', '#444d90', [-.209, 0, 0], [.172, .018, .10]);
  mesh(satellite, 'box', '#444d90', [.209, 0, 0], [.172, .018, .10]);
  mesh(satellite, 'ball', '#78dcff', [0, .016, .104], [.038, .037, .036], 'glow');
  return (time) => {
    material.uniforms.seconds.value = time;
    satellite.position.set(2.45 + Math.sin(time * .32) * .73, 1.61 + Math.cos(time * .54) * .19, -1.20 + Math.sin(time * .43) * .39);
    satellite.rotation.set(.32, time * .68, .38 + Math.sin(time * .66) * .25);
  };
}

function crescentShape() {
  const shape = new THREE.Shape();
  shape.moveTo(.22, .74);
  shape.bezierCurveTo(-.51, .85, -.86, .28, -.71, -.29);
  shape.bezierCurveTo(-.52, -.89, .36, -1.01, .73, -.35);
  shape.bezierCurveTo(.16, -.59, -.35, -.24, -.30, .22);
  shape.bezierCurveTo(-.27, .49, -.07, .66, .22, .74);
  return new THREE.ShapeGeometry(shape, 30);
}

export function makeAtmosphere(model, scene, id, theme, random, tall) {
  const { group, geometry, mesh, radial } = model;
  const haloX = tall ? (id === 'orbit' ? -2.52 : -2.88) : (id === 'orbit' ? -3.73 : -4.17);
  const halo = group(scene, haloX, 1.53, -1.55);
  const radius = { orbit: .89, moon: .69, aurora: .35, oasis: .69 }[id] ?? .51;
  const nativeLabel = id === 'orbit' ? 'Planet' : id === 'grove' || id === 'oasis' ? 'Sun' : 'Moon';
  let label = nativeLabel;
  const bounds = new THREE.Sphere(halo.position, radius);
  const glow = mesh(halo, 'disc', radial('sky glow', theme.light, .36, true), [0, 0, -.074], [1.48, 1.48, 1]);
  const lightRing = mesh(halo, 'ring', model.track(new THREE.MeshBasicMaterial({
    color: theme.light, transparent: true, depthWrite: false, opacity: 0,
  })), [0, 0, .12], [radius, radius, 1]);
  const nativeBody = group(halo);
  const skyInk = (color) => model.track(new THREE.MeshBasicMaterial({ color, transparent: true, depthWrite: false }));
  const liveSun = id === 'orbit' ? null : mesh(halo, 'ball', skyInk('#ffdfa0'), [0, 0, 0], [.50, .50, .092]);
  const liveMoon = id === 'orbit' ? null : mesh(halo, geometry('crescent', crescentShape), skyInk('#dce6ff'), [0, 0, 0], [.65, .65, 1]);
  if (liveMoon) liveMoon.rotation.z = -.20;
  let skyMotion;
  if (id === 'orbit') {
    skyMotion = orbitalSky(model, scene, nativeBody);
  } else if (id === 'aurora') {
    mesh(nativeBody, 'ball', '#bcddf0', [0, 0, 0], [.257, .257, .060], 'glow');
    skyMotion = aurora(model, scene);
  } else if (id === 'moon') {
    mesh(nativeBody, geometry('crescent', crescentShape), theme.light, [0, 0, 0], [.83, .83, 1], 'glow').rotation.z = -.20;
  } else {
    const disc = mesh(nativeBody, 'ball', theme.light, [0, 0, 0], [id === 'oasis' ? .64 : .45, id === 'oasis' ? .64 : .45, .11], 'glow');
    if (id === 'oasis') {
      for (const [y, width] of [[-.29, .53], [-.40, .465], [-.47, .40]]) {
        mesh(disc, 'box', '#cf887e', [0, y / .64, .76], [2 * width / .64, .051, .037], 'glow');
      }
    }
  }
  const stars = particleField(model, scene, random, { count: 100, size: .092, drift: [0, 0], shape: 0, color: theme.sky }, true);
  const air = particleField(model, scene, random, AIR[theme.air], false);
  function paint(time, camera, pixelsPerUnit, signal, climate, cloud = 0) {
    const live = Boolean(climate && liveSun);
    const night = climate?.phase === 'night';
    const twilight = climate?.phase === 'dawn' || climate?.phase === 'dusk';
    const dimmed = Math.max(.24, 1 - cloud * .73);
    nativeBody.visible = !live;
    if (liveSun) {
      liveSun.visible = live && !night;
      liveMoon.visible = live && night;
      liveSun.material.opacity = liveMoon.material.opacity = dimmed;
    }
    label = live ? night ? 'Moon' : 'Sun' : nativeLabel;
    halo.position.y = twilight ? 1.05 : 1.53;
    bounds.radius = live ? .54 : radius;
    halo.quaternion.copy(camera.quaternion);
    glow.material.opacity = (.36 + signal * .41) * dimmed;
    glow.scale.set(1.48 + signal * .43, 1.48 + signal * .43, 1);
    const breath = radius * (1.18 + (1 - signal) * .47);
    lightRing.visible = signal > .04;
    lightRing.scale.set(breath, breath, 1);
    lightRing.material.opacity = signal * .48;
    stars(time, pixelsPerUnit, climate ? (night ? dimmed : .13 * dimmed) : 1);
    const nativeWeather = ['snow', 'sand', 'rain'].includes(theme.air);
    air(time, pixelsPerUnit, climate && nativeWeather ? 0 : climate ? .68 : 1);
    skyMotion?.(time);
  }

  return { bounds, get label() { return label; }, paint };
}
