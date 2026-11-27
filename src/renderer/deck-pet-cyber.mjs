import * as THREE from '../../node_modules/three/build/three.module.js';

export function makeRobot(model, scene, species) {
  const { group, mesh, link, geometry, radial } = model;
  const drone = species === 'drone';
  const metal = model.custom('robot shell', () => new THREE.MeshStandardMaterial({
    color: drone ? '#bfbeeb' : '#b8ccdc', metalness: .24, roughness: .32,
  }));
  const trim = drone ? '#574d86' : '#324760';
  const light = drone ? '#a5fcd9' : '#8bf0ff';
  const faceLight = model.custom('robot emotion display', () => new THREE.MeshBasicMaterial({ color: light }));
  const root = group(scene, .25, 0, .57);
  const body = group(root);
  mesh(body, 'ball', metal, [0, drone ? .64 : .47, -.07], drone ? [.56, .48, .43] : [.47, .47, .41]);
  mesh(body, 'ball', trim, [0, drone ? .43 : .46, .207], [.291, .23, .14]);
  mesh(body, 'facet', light, [0, drone ? .39 : .46, .338], [.095, .088, .045], 'glow');
  const head = group(body, 0, drone ? .60 : .96, .132);
  mesh(head, 'ball', metal, [0, .21, 0], [drone ? .65 : .60, .435, .48]);
  mesh(head, 'ball', '#192841', [0, .211, .286], [.509, .292, .26]);
  const eyes = [];
  const limbs = [];
  const ears = [];
  for (const side of [-1, 1]) {
    const rig = group(head, side * .453, .38, -.02);
    const tilt = -side * .28;
    rig.rotation.z = tilt;
    mesh(rig, drone ? 'ball' : 'cone', trim, [0, drone ? .09 : .16, 0], drone ? [.132, .225, .17] : [.172, .51, .119]);
    mesh(rig, drone ? 'ball' : 'cone', light, [0, .149, .096], [.071, drone ? .121 : .26, .042], 'glow');
    ears.push({ rig, side, tilt });
    const eye = group(head, side * .206, .265, .512);
    mesh(eye, 'ball', faceLight, [0, 0, 0], [.088, drone ? .087 : .111, .021]);
    mesh(eye, 'ball', '#efffff', [-.022, .033, .018], [.022, .020, .009], 'glow');
    eyes.push(eye);
    const arm = group(body, side * .406, .64, -.019);
    const disc = geometry('robot joint', () => new THREE.CylinderGeometry(.14, .14, .085, 14));
    mesh(arm, disc, trim, [0, -.055, 0], [1, 1, 1]).rotation.z = Math.PI / 2;
    mesh(arm, 'ball', metal, [0, -.19, 0], drone ? [.15, .17, .27] : [.13, .235, .145]);
    mesh(arm, 'ball', light, [side * .094, -.27, .10], [.034, .043, .050], 'glow');
    if (!drone) mesh(body, 'ball', trim, [side * .285, .126, .265], [.192, .132, .238]);
    limbs.push({ rig: arm, side });
  }
  const mouth = group(head, 0, .14, .548);
  mesh(mouth, 'ball', faceLight, [0, 0, 0], [.069, .019, .010]);
  const tail = group(body, .29, drone ? .65 : .25, -.31);
  if (!drone) {
    link(tail, 'column', trim, [0, 0, 0], [.25, .14, -.13], .050);
    link(tail, 'column', metal, [.25, .14, -.13], [.35, .36, -.15], .041);
    mesh(tail, 'ball', light, [.35, .36, -.15], [.051, .051, .052], 'glow');
  } else {
    link(head, 'column', trim, [.20, .52, -.12], [.30, .767, -.15], .026);
    mesh(head, 'facet', light, [.30, .775, -.15], [.066, .068, .065], 'glow');
    mesh(body, 'disc', radial('thruster', light, .51, true), [0, .152, 0], [.32, .19, 1]);
    mesh(body, 'ball', light, [0, .193, -.05], [.187, .041, .18], 'glow');
  }
  return { root, body, head, eyes, ears, limbs, tail, mouth, blush: [], faceLight, faceColor: light, species, hover: drone ? .27 : 0 };
}

function lightStrip(model, parent, color, from, to, width = .025) {
  const strip = model.link(parent, 'column', color, from, to, width);
  strip.material = model.custom('lit strip ' + color, () => new THREE.MeshBasicMaterial({ color }));
}

function neonAlley(model, island, theme) {
  const { group, mesh, radial } = model;
  const city = group(island);
  for (const [index, [x, z, width, height]] of [[-1.92, -.60, .58, 1.32], [-1.20, -1.03, .72, 1.76],
    [-.37, -1.39, .72, 2.03], [.46, -1.48, .62, 1.42], [1.16, -.99, .71, 1.77], [1.86, -.56, .51, 1.25]].entries()) {
    const block = group(city, x, 0, z);
    const trim = index % 2 ? '#625480' : '#453963';
    const signal = index % 2 ? '#72e6f6' : '#f975c8';
    mesh(block, 'box', '#25223c', [0, height * .5, 0], [width, height, .55]);
    mesh(block, 'box', trim, [0, height + .017, 0], [width * 1.05, .07, .57]);
    mesh(block, 'box', trim, [0, height * .30, .28], [width * .81, .06, .044]);
    for (let floor = 1; floor <= Math.floor(height / .23); floor++) {
      for (const side of [-1, 1]) {
        const open = (floor + index + side) % 3;
        mesh(block, 'box', open ? signal : '#352a50', [side * width * .23, floor * .226, .282],
          [width * .24, .081, .021], open ? 'glow' : undefined);
      }
    }
    if (index % 2) {
      lightStrip(model, block, signal, [-width * .54, .12, .30], [-width * .54, height * .98, .30], .023);
      lightStrip(model, block, '#f69bd8', [-.19, height + .047, .22], [.21, height + .047, .22], .03);
    }
  }
  const kiosk = group(island, 1.49, 0, .60);
  mesh(kiosk, 'box', '#413753', [0, .24, 0], [.29, .48, .25]);
  mesh(kiosk, 'box', '#654864', [0, .50, -.015], [.46, .27, .32]);
  mesh(kiosk, 'box', '#f46fc3', [0, .54, .154], [.37, .167, .022], 'glow');
  for (const y of [.51, .555, .594]) mesh(kiosk, 'box', '#fff4fc', [-.04, y, .167], [.22 - (y - .51), .011, .009], 'glow');
  mesh(kiosk, 'disc', radial('terminal halo', '#f578c8', .53, true), [0, .53, .168], [.43, .42, 1]);
  for (const x of [-1.28, .99]) {
    lightStrip(model, island, theme.accent, [x, .035, .68], [x + .30, .035, 1.18], .027);
  }
  const skiff = group(island);
  mesh(skiff, 'box', '#746589', [0, 0, 0], [.39, .091, .14]);
  mesh(skiff, 'ball', '#c19ccb', [0, .049, 0], [.135, .063, .069]);
  mesh(skiff, 'box', '#8cffff', [0, -.02, .083], [.31, .020, .015], 'glow');
  skiff.userData.moving = true;
  return (time) => {
    skiff.position.set(Math.sin(time * .44 + 1.3) * 2.1, 1.84 + Math.sin(time * 1.36) * .06, -1.12);
    skiff.rotation.z = Math.sin(time * .44) * .11;
  };
}

function cyberGreenhouse(model, island, theme) {
  const { group, mesh, geometry, radial } = model;
  const arch = geometry('greenhouse ribs', () => new THREE.TorusGeometry(1.80, .031, 8, 32, Math.PI));
  for (const z of [-1.18, -.79, -.41]) {
    mesh(island, arch, '#448b89', [0, .11, z], [1.08, .96, 1.18]);
    mesh(island, arch, theme.accent, [0, .15, z], [1.06, .95, .35], 'glow');
  }
  for (const [index, x] of [-1.64, -.90, .75, 1.60].entries()) {
    const planter = group(island, x, 0, -.53 - (index % 2) * .38);
    mesh(planter, 'column', '#446576', [0, .12, 0], [.24, .23, .24]);
    mesh(planter, 'column', theme.light, [0, .234, 0], [.24, .023, .24], 'glow');
    for (let leaf = 0; leaf < 7; leaf++) {
      const shoot = group(planter, 0, .23, 0);
      shoot.rotation.y = leaf * 2.39;
      const color = leaf % 2 ? '#76bfa3' : '#3ba58e';
      const blade = mesh(shoot, 'ball', color, [.097, .19 + (leaf % 3) * .055, 0], [.105, .27, .035]);
      blade.rotation.z = -.42;
      mesh(shoot, 'ball', theme.accent, [.17, .34 + (leaf % 3) * .046, .028], [.020, .043, .015], 'glow');
    }
  }
  const reactor = group(island, -1.53, .04, .67);
  mesh(reactor, 'column', '#365867', [0, .085, 0], [.316, .16, .316]);
  mesh(reactor, 'column', '#7ed9c5', [0, .166, 0], [.298, .031, .298], 'glow');
  const liquid = model.track(new THREE.MeshPhysicalMaterial({
    color: '#5cc4ac', transparent: true, opacity: .28, depthWrite: false, roughness: .15,
  }));
  mesh(reactor, 'column', liquid, [0, .418, 0], [.245, .48, .245]);
  mesh(reactor, 'disc', radial('reactor halo', '#82ffd4', .48, true), [0, .44, .216], [.51, .45, 1]);
  mesh(reactor, 'column', '#89cbb5', [0, .658, 0], [.268, .07, .268]);
  const core = mesh(reactor, 'facet', '#a1ffdb', [0, .44, 0], [.138, .145, .135], 'glow');
  core.userData.moving = true;
  lightStrip(model, island, '#63d8bf', [1.37, .027, .30], [1.57, .032, 1.16]);
  return (time) => {
    core.rotation.set(time * .68, time * .94, .27);
    core.position.y = .44 + Math.sin(time * 2) * .05;
  };
}

export function makeCyberScenery(model, island, id, theme) {
  return id === 'neon' ? neonAlley(model, island, theme) : cyberGreenhouse(model, island, theme);
}
