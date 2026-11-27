'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const { AquariumSettings } = require('../src/main/aquarium-settings');
const { DeckNavigation } = require('../src/main/deck-navigation');
const { readSettings } = require('../src/main/configuration-backup');
const { normalizeAquarium, applyAquariumPreset, aquariumLight, solarElevation, SPECIES, STOCK_LIMIT,
  DECORATION_LIMIT } = require('../src/shared/aquarium');
const { tempDir } = require('./helpers/temp-dir');

test('an aquarium preset changes scenery and inhabitants while preserving user preferences', () => {
  const view = applyAquariumPreset({ enabled: false, quality: 'eco', motion: 'still', dawn: '08:15' }, 'forest');
  assert.equal(view.enabled, false);
  assert.equal(view.quality, 'eco');
  assert.equal(view.motion, 'still');
  assert.equal(view.dawn, '08:15');
  assert.equal(view.growth, 'kelp');
  assert.ok(view.stock.sardine > 0 && view.stock.jelly > 0);
  assert.equal(view.stock.clown, 0);
  assert.equal(Object.values(normalizeAquarium({ stock: {} }).stock).reduce((sum, count) => sum + count), 0);
  const tooMany = Object.fromEntries(Object.keys(SPECIES).map((id) => [id, 200]));
  const checked = normalizeAquarium({ stock: tooMany, water: 'bad', dawn: '24:00', dusk: '07:00' });
  assert.equal(Object.values(checked.stock).reduce((sum, count) => sum + count), STOCK_LIMIT);
  assert.ok(Object.entries(checked.stock).every(([id, count]) => count >= 0 && count <= SPECIES[id].max));
  assert.deepEqual([checked.water, checked.dawn, checked.dusk], ['clear', '07:00', '19:00']);
});

test('the actual sun drives the cycle even across seasons and UTC midnight', () => {
  const settings = normalizeAquarium();
  const rome = { latitude: 41.9, longitude: 12.5 };
  const sydney = { latitude: -33.87, longitude: 151.21 };
  const noon = new Date('2026-06-21T11:00:00Z');
  assert.ok(solarElevation(noon, rome.latitude, rome.longitude) > 65);
  assert.equal(aquariumLight(settings, noon, rome).day, 1);
  assert.equal(aquariumLight(settings, noon, sydney).day, 0);
  assert.equal(aquariumLight(settings, new Date('2026-06-21T00:00:00Z'), rome).day, 0);
  assert.equal(aquariumLight(settings, new Date('2026-06-21T00:00:00Z'), { latitude: 80, longitude: 0 }).day > .3, true);
  assert.equal(aquariumLight(settings, new Date('2026-12-21T12:00:00Z'), { latitude: 80, longitude: 0 }).day, 0);
  const sunset = aquariumLight(settings, new Date('2026-06-21T18:55:00Z'), rome);
  assert.ok(sunset.day < .5 && sunset.twilight > .3);
});

test('the custom schedule follows the local clock and can run past midnight', () => {
  const local = (hour, minute = 0) => new Date(2026, 10, 27, hour, minute);
  const settings = normalizeAquarium({ dawn: '22:00', dusk: '06:00' });
  assert.equal(aquariumLight(settings, local(2)).day, 1);
  assert.equal(aquariumLight(settings, local(14)).day, 0);
  const manual = { ...settings, lighting: 'schedule' };
  assert.equal(aquariumLight(manual, local(2), { latitude: 0, longitude: 12 }).day, 1);
  assert.ok(aquariumLight(manual, local(22)).twilight > .6);
});

test('night brightness and glow keep separate values in legacy settings, presets, and saved profiles', (t) => {
  const legacy = normalizeAquarium({ brightness: 64 });
  assert.deepEqual([legacy.brightness, legacy.nightBrightness, legacy.glowIntensity], [64, 64, 80]);
  const defaults = normalizeAquarium();
  assert.deepEqual([defaults.nightBrightness, defaults.glowIntensity], [100, 100]);
  const file = path.join(tempDir(t, 'lastra-night-lighting-'), 'aquarium.json');
  const settings = new AquariumSettings(file).configure({ ...legacy, nightBrightness: 250, glowIntensity: 0 });
  const stored = new AquariumSettings(file).current;
  assert.deepEqual([stored.brightness, stored.nightBrightness, stored.glowIntensity], [64, 200, 0]);
  assert.deepEqual(stored, settings);
  const preset = applyAquariumPreset({ ...stored, brightness: 135, previewLighting: 'day' }, 'atoll');
  assert.deepEqual([preset.brightness, preset.nightBrightness, preset.glowIntensity], [135, 200, 0]);
  assert.equal(Object.hasOwn(preset, 'previewLighting'), false);
  const clamped = normalizeAquarium({ nightBrightness: 0, glowIntensity: 420 });
  assert.deepEqual([clamped.nightBrightness, clamped.glowIntensity], [20, 200]);
});

test('lighting preview changes stay in memory and roll back to the most recent saved settings', (t) => {
  const file = path.join(tempDir(t, 'lastra-lighting-preview-'), 'aquarium.json');
  const settings = new AquariumSettings(file);
  const saved = settings.configure({ nightBrightness: 95, glowIntensity: 42, lighting: 'schedule', dawn: '09:15', dusk: '21:45' });
  const before = fs.readFileSync(file, 'utf8');
  assert.deepEqual(settings.previewLighting({ mode: 'day', nightBrightness: 300, glowIntensity: 0, dawn: '00:00' }),
    { mode: 'day', nightBrightness: 200, glowIntensity: 0 });
  assert.deepEqual(settings.previewLighting({ mode: 'night', nightBrightness: 300, glowIntensity: 0 }),
    { mode: 'night', nightBrightness: 200, glowIntensity: 0 });
  assert.throws(() => settings.previewLighting({ mode: 'auto', nightBrightness: 100, glowIntensity: 80 }), /Invalid aquarium lighting preview/);
  assert.throws(() => settings.previewLighting({ mode: 'night', glowIntensity: 80 }), /Invalid aquarium lighting preview/);
  assert.equal(fs.readFileSync(file, 'utf8'), before);
  assert.deepEqual(settings.current, saved);
  assert.equal(settings.previewLighting(null), null);
  assert.deepEqual(settings.current, saved);

  settings.previewLighting({ mode: 'day', nightBrightness: 64, glowIntensity: 71 });
  const updated = settings.configure({ ...saved, nightBrightness: 65, glowIntensity: 70 });
  assert.deepEqual(settings.lightingPreview, { mode: 'day', nightBrightness: 65, glowIntensity: 70 });
  settings.previewLighting({ mode: 'night', nightBrightness: 120, glowIntensity: 50 });
  settings.previewLighting(null);
  assert.deepEqual(settings.current, updated);
  assert.deepEqual(new AquariumSettings(file).current, updated);
  assert.equal(new AquariumSettings(file).lightingPreview, null);
  assert.deepEqual([updated.lighting, updated.dawn, updated.dusk], ['schedule', '09:15', '21:45']);
});

test('aquarium settings and the selected view survive a reload and appear in backups', (t) => {
  const directory = tempDir(t, 'lastra-aquarium-');
  const file = path.join(directory, 'aquarium.json');
  const nav = path.join(directory, 'deck-navigation.json');
  const persisted = new AquariumSettings(file);
  assert.ok(persisted.current.enabled);
  const expected = persisted.configure({ enabled: false, preset: 'river', stock: { tetra: 5, nerite: 2 } });
  assert.deepEqual(new AquariumSettings(file).current, expected);
  assert.deepEqual(readSettings(directory).files['aquarium.json'].settings, expected);
  new DeckNavigation(nav).setView('aquarium');
  assert.equal(new DeckNavigation(nav).current.view, 'aquarium');
});

test('decoration positions, feeding choices and tank options round-trip and clamp to supported ranges', (t) => {
  const directory = tempDir(t, 'lastra-tank-');
  const file = path.join(directory, 'aquarium.json');
  const store = new AquariumSettings(file);
  const settings = store.configure({
    ...store.current, tank: 'rimless', current: 'strong', depth: 'deep', feedType: 'wafers', portion: 7, rocks: 0,
    decorations: [{type:'unknown'}, {type:'arch',x:999,depth:-9,size:205,rotation:-181}],
  });
  assert.deepEqual(settings.decorations,[{type:'arch',x:100,depth:0,size:200,rotation:-180}]);
  assert.deepEqual(new AquariumSettings(file).current,settings);
  assert.deepEqual([settings.portion,settings.feedType,settings.rocks,settings.tank],[3,'wafers',0,'rimless']);
  assert.equal(normalizeAquarium({decorations:Array(18).fill({type:'jar'})}).decorations.length,DECORATION_LIMIT);
  assert.equal(applyAquariumPreset(settings,'wreck').decorations[0].type,'wreck');
  assert.equal(applyAquariumPreset(settings,'reef').feedType,'wafers');
});

test('food floats or sinks, can only be consumed in reach, and expires with a bounded particle store', async () => {
  const { createFoodSimulation, MAX_FOOD } = await import('../src/renderer/aquarium-feeding.mjs');
  const simulation = () => createFoodSimulation({random:()=>.5,floor:()=>0});
  const flakes=simulation(), wafers=simulation();
  const near={ x:0,y:1.5,z:0 };
  assert.ok(flakes.drop(0,0,1.5,'flakes',1));
  assert.ok(wafers.drop(0,0,1.5,'wafers',1));
  assert.equal(flakes.drop(0,0,1.5,'flakes',1),false);
  for (let i=0;i<22;i++) { flakes.step(.10); wafers.step(.10); }
  assert.ok(wafers.particles.every((piece)=>piece.grounded));
  assert.ok(flakes.particles.some((piece)=>!piece.grounded));
  assert.ok(flakes.find(near,'swimmer',4));
  assert.equal(wafers.find(near,'swimmer',4),undefined);
  const bite=wafers.find(near,'bed',4);
  assert.ok(bite);
  assert.equal(wafers.consume(bite,{x:6,y:0,z:3},.5),false);
  assert.equal(wafers.consume(bite,bite,.3),true);
  assert.equal(wafers.consume(bite,bite,.3),false);
  for(let i=0;i<10;i++) { flakes.step(.41); flakes.drop(0,0,2,'flakes',3); }
  assert.equal(flakes.particles.length,MAX_FOOD);
  flakes.step(24);
  assert.equal(flakes.active(),false);
});

test('swimming fish and a bottom scavenger change course and consume reachable food', async () => {
  const [THREE, { makeFish }, { makeInhabitants }, { createFoodSimulation }, { aquariumResources, seededRandom }, { floorAt }] = await Promise.all([
    import('../node_modules/three/build/three.module.js'),
    import('../src/renderer/aquarium-fish.mjs'),
    import('../src/renderer/aquarium-inhabitants.mjs'),
    import('../src/renderer/aquarium-feeding.mjs'),
    import('../src/renderer/aquarium-materials.mjs'),
    import('../src/renderer/aquarium-habitat.mjs'),
  ]);
  const bank = [{ x: 0, z: -5, size: 1 }];
  const uniforms = { tankTime: { value: 0 }, tankLight: { value: 1 }, tankFlow: { value: 1 } };
  for (const atBottom of [false,true]) {
    const scene = new THREE.Scene();
    const resources = aquariumResources();
    try {
      const food = createFoodSimulation({ random:seededRandom(51), floor:floorAt });
      const originalConsume = food.consume;
      let meals = 0;
      food.consume = (...args) => {
        const ate = originalConsume(...args);
        if (ate) meals++;
        return ate;
      };
      const settings = normalizeAquarium({ stock:atBottom ? { crayfish:1 } : { clown:1 }, quality:'eco' });
      const motion = atBottom ? makeInhabitants(scene,resources,uniforms,settings,seededRandom(432),9,bank,food)
        : makeFish(scene,resources,uniforms,settings,seededRandom(432),9,bank,food);
      const step = (delta,time) => atBottom ? motion(time,delta,1) : motion(delta,1);
      step(0,0);
      const actor = scene.children[0];
      const origin = actor.position.clone();
      const x = origin.x + 1.7;
      const height = atBottom ? floorAt(x,origin.z)+.75 : origin.y+.68;
      assert.ok(food.drop(x,origin.z,height,atBottom?'wafers':'pellets',2));
      for (let i=1;i<=160;i++) { food.step(.04); step(.04,i*.04); }
      assert.ok(meals > 0, atBottom ? 'A crayfish ate a wafer' : 'A clownfish ate a pellet');
    } finally {
      scene.traverse((node)=>{ if (node.isInstancedMesh) node.dispose(); });
      resources.dispose();
    }
  }
});

test('a panoramic aquarium spreads swimming fish across depth and side lanes', async () => {
  const [THREE,{makeFish},{createFoodSimulation},{aquariumResources,seededRandom}] = await Promise.all([
    import('../node_modules/three/build/three.module.js'),
    import('../src/renderer/aquarium-fish.mjs'),
    import('../src/renderer/aquarium-feeding.mjs'),
    import('../src/renderer/aquarium-materials.mjs'),
  ]);
  const scene = new THREE.Scene();
  const resources = aquariumResources();
  try {
    const random = seededRandom(82717);
    const banks = [
      {x:-12,z:2,size:1.4,plane:'middle'}, {x:4,z:-7,size:1.8,plane:'middle'},
      {x:-8,z:7,size:2,plane:'front'}, {x:8,z:6,size:2,plane:'front'},
    ];
    const settings=normalizeAquarium({ stock:{anthias:12,tang:3,clown:4}, quality:'eco' });
    const food = createFoodSimulation({ random, floor: () => 0 });
    makeFish(scene,resources,{},settings,random,20,banks,food)(0,1);
    const locations=scene.children.map(({position})=>position);
    assert.ok(locations.some(({z})=>z>4));
    assert.ok(locations.some(({z})=>z< -10));
    assert.ok(locations.some(({x})=>x>13) && locations.some(({x})=>x< -12));
  } finally {
    resources.dispose();
  }
});

test('mobile molluscs explore new ground and react to food while attached bivalves stay in place', async () => {
  const [THREE,{makeInhabitants},{createFoodSimulation},{aquariumResources,seededRandom,placeMesh},
    {floorAt},{aquariumObstacles}] = await Promise.all([
    import('../node_modules/three/build/three.module.js'),
    import('../src/renderer/aquarium-inhabitants.mjs'),
    import('../src/renderer/aquarium-feeding.mjs'),
    import('../src/renderer/aquarium-materials.mjs'),
    import('../src/renderer/aquarium-habitat.mjs'),
    import('../src/renderer/aquarium-obstacles.mjs'),
  ]);
  const scene=new THREE.Scene(), resources=aquariumResources(), obstacles=aquariumObstacles();
  try {
    const rock=resources.keep(new THREE.BoxGeometry(2,1.6,1.7));
    const material=resources.keep(new THREE.MeshStandardMaterial());
    obstacles.add(placeMesh(scene,rock,material,0,.65,1));
    const food=createFoodSimulation({random:seededRandom(914),floor:floorAt});
    const settings=normalizeAquarium({stock:{conch:1,scallop:1,octopus:1,cuttlefish:1,mussel:1}});
    const animate=makeInhabitants(scene,resources,{},settings,seededRandom(414),10,[{x:0,z:1,size:1.2}],food,{obstacles});
    animate(0,0,1);
    const [conch,scallop,octopus,cuttlefish,mussel]=scene.children.slice(1);
    const origins=scene.children.slice(1).map(({position})=>position.clone());
    const {x,y,z}=conch.position;
    assert.ok(food.drop(x+.5,z+.12,y+.44,'wafers',2));
    let reachedFood=false, hop=0, hover=0, conchRange=0, octopusRange=0;
    for (let tick=1; tick<=1250; tick++) {
      food.step(.048);
      animate(tick*.048,.048,1);
      reachedFood ||= food.particles.some((piece)=>piece.eaten);
      hop=Math.max(hop,scallop.position.y-floorAt(scallop.position.x,scallop.position.z));
      hover=Math.max(hover,cuttlefish.position.y-floorAt(cuttlefish.position.x,cuttlefish.position.z));
      conchRange=Math.max(conchRange,conch.position.distanceTo(origins[0]));
      octopusRange=Math.max(octopusRange,octopus.position.distanceTo(origins[2]));
      assert.ok(Math.abs(conch.position.y-floorAt(conch.position.x,conch.position.z)-.034)<.001);
      for (const animal of [conch,scallop,octopus,cuttlefish]) assert.ok(obstacles.clear(animal.position,animal.position,.12,.02));
    }
    assert.ok(reachedFood);
    assert.ok(conchRange>2.1 && octopusRange>2.8);
    assert.ok(hop>.36 && hover>1.2);
    assert.deepEqual(mussel.position.toArray(),origins[4].toArray());
  } finally {
    scene.traverse((node)=>{ if (node.isInstancedMesh) node.dispose(); });
    resources.dispose();
  }
});

test('mobile invertebrates explore and respond to nearby animals', async () => {
  const [THREE,{aquariumInvertebrateMotion},{createFoodSimulation},{floorAt},{seededRandom}] = await Promise.all([
    import('../node_modules/three/build/three.module.js'),
    import('../src/renderer/aquarium-invertebrate-motion.mjs'),
    import('../src/renderer/aquarium-feeding.mjs'),
    import('../src/renderer/aquarium-habitat.mjs'),
    import('../src/renderer/aquarium-materials.mjs'),
  ]);
  const guests=[new THREE.Group(),new THREE.Group()];
  for (const guest of guests) guest.visible=false;
  const food=createFoodSimulation({random:seededRandom(32),floor:floorAt});
  const motion=aquariumInvertebrateMotion(seededRandom(938),14,[],food,{swimmers:guests});
  function resident(id,x,z) {
    const node=new THREE.Group(), actions=new Set();
    assert.ok(motion.add(id,node,(_time,_day,_feeding,mode)=>actions.add(mode),null,x,z));
    assert.ok(node.visible);
    return {node,actions,origin:node.position.clone(),furthest:0};
  }
  const cleaner=resident('cleaner',-7,-2);
  const cherry=resident('cherry',-2,4);
  const crab=resident('kelpCrab',5,1);
  const otherCrab=resident('emerald',6.45,1);
  const star=resident('star',-2,-5);
  const jelly=resident('jelly',3,-7);
  const everyone=[cleaner,cherry,crab,otherCrab,star,jelly];
  guests[0].position.copy(cleaner.origin).add(new THREE.Vector3(-1.15,.12,0));
  guests[1].position.copy(cherry.origin).add(new THREE.Vector3(-1.10,.11,0));
  for (const guest of guests) guest.visible=true;
  for (let frame=0; frame<1340; frame++) {
    if (frame===65) for (const guest of guests) guest.visible=false;
    motion.animate(.047,.82,[]);
    for (const animal of everyone) animal.furthest=Math.max(animal.furthest,animal.origin.distanceTo(animal.node.position));
  }
  assert.ok(cleaner.actions.has('clean') || cleaner.actions.has('approach'));
  assert.ok(cherry.actions.has('retreat'));
  assert.ok(crab.actions.has('display') && crab.actions.has('retreat'));
  assert.ok(everyone.every((animal)=>animal.furthest>2));
  assert.ok(jelly.node.position.y-floorAt(jelly.node.position.x,jelly.node.position.z)>1);
});

test('an approaching crab curves around a solid obstacle without coming to a stop', async () => {
  const [THREE,{aquariumInvertebrateMotion},{createFoodSimulation},{floorAt},{seededRandom},{aquariumObstacles}] = await Promise.all([
    import('../node_modules/three/build/three.module.js'),
    import('../src/renderer/aquarium-invertebrate-motion.mjs'),
    import('../src/renderer/aquarium-feeding.mjs'),
    import('../src/renderer/aquarium-habitat.mjs'),
    import('../src/renderer/aquarium-materials.mjs'),
    import('../src/renderer/aquarium-obstacles.mjs'),
  ]);
  const obstacles=aquariumObstacles(), node=new THREE.Group();
  const food=createFoodSimulation({random:seededRandom(1),floor:floorAt});
  const motion=aquariumInvertebrateMotion(seededRandom(21),17,[],food,{obstacles});
  const geometry=new THREE.BoxGeometry(.86,1.1,1.46);
  const block=new THREE.Mesh(geometry);
  const forward=new THREE.Vector3(), previous=new THREE.Vector3(), offset=new THREE.Vector3(), heading=new THREE.Vector3();
  const center=new THREE.Vector3();
  const dt=.035;
  let mode, rolling=0, samples=0, bent=false;
  try {
    motion.add('kelpCrab',node,(_time,_day,_biting,action)=>{mode=action;},null,0,2);
    previous.copy(node.position);
    for (let tick=0; tick<210 && samples<56; tick++) {
      motion.animate(dt,1,[]);
      offset.subVectors(node.position,previous);
      previous.copy(node.position);
      const speed=offset.length()/dt;
      offset.y=0;
      offset.normalize();
      if (rolling<16 && mode==='roam' && speed>.68) {
        rolling++;
        if (rolling===16) {
          forward.copy(offset);
          heading.copy(offset);
          block.position.copy(node.position).addScaledVector(forward,2.15);
          block.position.y=floorAt(block.position.x,block.position.z)+.43;
          block.rotation.y=-Math.atan2(forward.z,forward.x);
          obstacles.add(block);
        }
        continue;
      }
      if (rolling<16) continue;
      samples++;
      assert.ok(speed>.50, 'The crab stopped at the obstacle');
      assert.ok(heading.dot(offset)>.91, 'The crab snapped to a different heading');
      heading.copy(offset);
      bent ||= forward.dot(offset)<.72;
      center.copy(node.position);
      center.y+=.215;
      assert.ok(obstacles.clear(center,center,.64,.20));
    }
    assert.equal(samples,56);
    assert.ok(bent, 'The crab did not turn around the obstacle');
  } finally {
    geometry.dispose();
    block.material.dispose();
  }
});

test('picking and moving a decoration keeps its footprint aligned in front and rotated views', async () => {
  const [THREE, { makeAquariumPreviewCamera }, { positionDecoration }, { floorAt }] = await Promise.all([
    import('../node_modules/three/build/three.module.js'),
    import('../src/renderer/aquarium-preview-camera.mjs'),
    import('../src/renderer/aquarium-decorations.mjs'),
    import('../src/renderer/aquarium-habitat.mjs'),
  ]);
  const viewport = { left: 42, top: 75, width: 720, height: 210 };
  const canvas = { getBoundingClientRect: () => viewport };
  const camera = new THREE.PerspectiveCamera(35, viewport.width / viewport.height, .12, 100);
  camera.position.set(.22, 3.82, 17.5);
  const center = new THREE.Vector3(.50, 3.18, -5.2);
  const model = new THREE.Group();
  const geometry = new THREE.BoxGeometry(1.8, 2.5, 1.6);
  const material = new THREE.MeshBasicMaterial();
  const body = new THREE.Mesh(geometry, material);
  body.position.y = 1.4;
  model.add(body);
  const floor = (x, z) => x * .006 + z * .009;
  const width = 19.4;
  const item = { x: -18, depth: 60, size: 100, rotation: 20 };
  positionDecoration(model, item, floor, width);
  const preview = makeAquariumPreviewCamera(canvas, camera, center, [model], width, floor);
  const destination = new THREE.Group();
  positionDecoration(destination, { ...item, x: 14, depth: 38 }, floor, width);

  function screen(vector) {
    const ndc = vector.clone().project(camera);
    return new THREE.Vector2(viewport.left + (1 + ndc.x) * viewport.width / 2,
      viewport.top + (1 - ndc.y) * viewport.height / 2);
  }

  try {
    for (const pose of [{ yaw: 0, pitch: 0, zoom: 1 }, { yaw: .42, pitch: .51, zoom: 1.55 }]) {
      preview.setView(pose);
      const pick = screen(body.getWorldPosition(new THREE.Vector3()));
      const grab = preview.pick(pick.x, pick.y, 7);
      assert.equal(grab.index, 0);
      assert.deepEqual(preview.placement(grab, pick.x, pick.y), { x: item.x, depth: item.depth });
      const target = screen(destination.position).sub(screen(model.position)).add(pick);
      assert.deepEqual(preview.placement(grab, target.x, target.y), { x: 14, depth: 38 });
      assert.equal(preview.pick(viewport.left + 2, viewport.top + 2, 7), null);
    }
    assert.equal(preview.placement({ height: 0, offsetX: 0, offsetY: 0 }, viewport.left + 360, -500), null);

    camera.position.set(.22, 3.82, 17.5);
    positionDecoration(model, { ...item, x: -75, depth: 15 }, floorAt, width);
    positionDecoration(destination, { ...item, x: -95, depth: 31 }, floorAt, width);
    const uneven = makeAquariumPreviewCamera(canvas, camera, center, [model], width, floorAt);
    uneven.setView({ yaw: 0, pitch: 0, zoom: 1 });
    const pick = screen(body.getWorldPosition(new THREE.Vector3()));
    const grab = uneven.pick(pick.x, pick.y, 7);
    const target = screen(destination.position).sub(screen(model.position)).add(pick);
    assert.deepEqual(uneven.placement(grab, target.x, target.y), { x: -95, depth: 31 });
  } finally {
    geometry.dispose();
    material.dispose();
  }
});

test('a shoal crosses the tank and regroups while staying clear of rocks and placed coral', async () => {
  const [THREE,{makeFish},{createFoodSimulation},{aquariumResources,seededRandom,placeInstances},
    {floorAt},{makeDecorations},{aquariumObstacles}] = await Promise.all([
    import('../node_modules/three/build/three.module.js'),
    import('../src/renderer/aquarium-fish.mjs'),
    import('../src/renderer/aquarium-feeding.mjs'),
    import('../src/renderer/aquarium-materials.mjs'),
    import('../src/renderer/aquarium-habitat.mjs'),
    import('../src/renderer/aquarium-decorations.mjs'),
    import('../src/renderer/aquarium-obstacles.mjs'),
  ]);
  const scene = new THREE.Scene();
  const resources = aquariumResources();
  const obstacles = aquariumObstacles();
  try {
    const ridge = new THREE.Group();
    ridge.position.set(-7,0,-9);
    ridge.rotation.y=.57;
    scene.add(ridge);
    const rock = resources.keep(new THREE.BoxGeometry(1,1,1));
    const color = resources.keep(new THREE.MeshStandardMaterial());
    obstacles.add(placeInstances(ridge,rock,color,[{position:[0,1.9,0],scale:[3,3.8,1.7]}]));
    assert.equal(obstacles.clear({x:-7,y:2,z:-14},{x:-7,y:2,z:-4},.4,.4),false);
    assert.equal(obstacles.clear({x:-7,y:5,z:-14},{x:-7,y:5,z:-4},.4,.4),true);

    const settings = normalizeAquarium({ stock:{anthias:9}, quality:'eco',
      decorations:[{type:'coralThicket',x:-34,depth:73,size:186,rotation:30}] });
    const random = seededRandom(1847);
    const {nodes}=makeDecorations(scene,resources,{},floorAt,18,settings.decorations,random,'eco',obstacles);
    const [placed]=nodes;
    assert.equal(placed.position.x,-.34*18*.88);
    assert.equal(placed.position.z,5.5-73*.174);
    assert.equal(placed.scale.x,1.86);
    assert.equal(placed.rotation.y,30*Math.PI/180);
    const firstFish=scene.children.length;
    const food=createFoodSimulation({random,floor:floorAt});
    const motion=makeFish(scene,resources,{},settings,random,18,[],food,{obstacles});
    const school=scene.children.slice(firstFish);
    assert.equal(school.length,9);
    assert.ok(school.every((fish)=>fish.visible));
    const previous=school.map((fish)=>fish.position.clone());
    const [lead]=school;
    let left=Infinity,right=-Infinity,front=-Infinity,back=Infinity,together=0;
    for (let tick=0; tick<1020; tick++) {
      motion(.067,1);
      const {x,z}=lead.position;
      left=Math.min(left,x); right=Math.max(right,x);
      back=Math.min(back,z); front=Math.max(front,z);
      if (school.every((fish)=>fish.position.distanceToSquared(lead.position)<36)) together++;
      for (const [index,fish] of school.entries()) {
        const {min,max}=fish.geometry.boundingBox;
        const reach=fish.scale.x*Math.max(-min.x,max.x);
        const height=fish.scale.x*Math.max(-min.y,max.y);
        assert.ok(obstacles.clear(previous[index],fish.position,reach,height));
        previous[index].copy(fish.position);
      }
    }
    assert.ok(left < -14 && right > 14 && back < -12 && front > 4);
    assert.ok(together>740, 'Shoal regrouped at '+together+' of 1020 steps');
  } finally {
    scene.traverse((node)=>{ if (node.isInstancedMesh) node.dispose(); });
    resources.dispose();
  }
});

test('mixed schools leave room for each other and keep moving when feeding by a reef', async () => {
  const [THREE,{makeFish},{createFoodSimulation},{aquariumResources,seededRandom},{floorAt},{makeDecorations},{aquariumObstacles},
    {fishContact,fishContactsOverlap,poseFishContact}] = await Promise.all([
    import('../node_modules/three/build/three.module.js'),
    import('../src/renderer/aquarium-fish.mjs'),
    import('../src/renderer/aquarium-feeding.mjs'),
    import('../src/renderer/aquarium-materials.mjs'),
    import('../src/renderer/aquarium-habitat.mjs'),
    import('../src/renderer/aquarium-decorations.mjs'),
    import('../src/renderer/aquarium-obstacles.mjs'),
    import('../src/renderer/aquarium-fish-contact.mjs'),
  ]);
  const scene=new THREE.Scene();
  const resources=aquariumResources();
  try {
    const settings=normalizeAquarium({stock:{anthias:10,clown:4,tang:4,goldfish:7,angel:2},quality:'eco',
      decorations:[{type:'coralThicket',x:52,depth:61,size:195},{type:'ruins',x:68,depth:48,size:150}]});
    const obstacles=aquariumObstacles();
    makeDecorations(scene,resources,{},floorAt,12,settings.decorations,seededRandom(131),settings.quality,obstacles);
    const firstFish=scene.children.length;
    const food=createFoodSimulation({random:seededRandom(51),floor:floorAt});
    const update=makeFish(scene,resources,{},settings,seededRandom(8397),12,[],food,{waterline:6.8,obstacles});
    const swimmers=scene.children.slice(firstFish).map((mesh)=>{
      assert.ok(mesh.visible);
      const {min,max}=mesh.geometry.boundingBox;
      const shape={center:(min.x+max.x)*.5,
        half:[(max.x-min.x)*.5,Math.max(-min.y,max.y),Math.max(-min.z,max.z)]};
      return {mesh,volume:fishContact(shape,mesh.scale.x),anchor:mesh.position.clone(),previous:mesh.position.clone(),since:0};
    });
    const bites=food.consume;
    let meals=0;
    food.consume=(...args)=>{
      const eaten=bites(...args);
      if (eaten) meals++;
      return eaten;
    };
    const delta=.044;
    let swimmingFrames=0, sidewaysFrames=0;
    const displacement=new THREE.Vector3(), facing=new THREE.Vector3();
    for (let frame=0; frame<1480; frame++) {
      if (frame%310===20) assert.ok(food.drop(5,-1.6,6.8,'flakes',3));
      food.step(delta);
      update(delta,.67);
      for (const swimmer of swimmers) {
        const {mesh,volume,anchor,previous}=swimmer;
        displacement.subVectors(mesh.position,previous);
        if (displacement.lengthSq()>(delta*.36)**2) {
          swimmingFrames++;
          if (displacement.normalize().dot(facing.set(1,0,0).applyEuler(mesh.rotation))<.5) sidewaysFrames++;
        }
        previous.copy(mesh.position);
        poseFishContact(volume,mesh.position,mesh.rotation);
        const {x,y,z}=volume.bounds;
        assert.ok(obstacles.clear(volume.center,volume.center,x,y,z));
        if (anchor.distanceToSquared(mesh.position)>1.21) {
          anchor.copy(mesh.position);
          swimmer.since=frame;
        }
        assert.ok((frame-swimmer.since)*delta<11, 'A fish failed to leave its previous area');
      }
      for (let i=0; i<swimmers.length; i++) {
        for (let j=0; j<i; j++) assert.equal(fishContactsOverlap(swimmers[i].volume,swimmers[j].volume),false);
      }
    }
    assert.ok(meals>=15, `Only ${meals} food pieces were eaten`);
    assert.ok(sidewaysFrames/swimmingFrames<.14, `${sidewaysFrames} / ${swimmingFrames} swimming frames showed sideways motion`);
  } finally {
    scene.traverse((node)=>{ if (node.isInstancedMesh) node.dispose(); });
    resources.dispose();
  }
});

test('fish crossing in nearby depth layers leave a visible gap without a sudden turn', async () => {
  const [THREE,{makeFishMotion},{poseFishContact,fishContactsOverlap},{seededRandom}]=await Promise.all([
    import('../node_modules/three/build/three.module.js'),
    import('../src/renderer/aquarium-fish-motion.mjs'),
    import('../src/renderer/aquarium-fish-contact.mjs'),
    import('../src/renderer/aquarium-materials.mjs'),
  ]);
  const swimmingContacts=new Map();
  const motion=makeFishMotion(17,[],{active:()=>false},{swimmingContacts});
  const random=seededRandom(22);
  const body={contact:{center:0,half:[.77,.30,.22]},radius:.86,height:.43,nose:.64};
  const fish=[new THREE.Object3D(),new THREE.Object3D()];
  motion.add('tang',{speed:.82,pattern:1},[fish[0]],random,body);
  motion.add('goldfish',{speed:.82,pattern:1},[fish[1]],random,body);
  const actors=[...swimmingContacts.values()];
  for (const [i,actor] of actors.entries()) {
    const direction=i===0 ? 1 : -1;
    const z=-3+i*1.65;
    actor.mesh.position.set(-direction*2.5,3.8,z);
    actor.mesh.rotation.set(0,i===0 ? 0 : Math.PI,0,'YZX');
    actor.heading.set(direction,0,0);
    actor.velocity.copy(actor.heading).multiplyScalar(1.6);
    actor.goal.set(direction*12,3.8,z);
    actor.checkpoint.copy(actor.mesh.position);
    actor.pace=1.6;
    poseFishContact(actor.contact,actor.mesh.position,actor.mesh.rotation);
  }
  const previous=fish.map(({position})=>position.clone());
  const lastStep=fish.map(()=>new THREE.Vector3());
  const step=new THREE.Vector3();
  let samples=0, minGap=Infinity;
  for (let frame=0; frame<150; frame++) {
    motion.draw(.025,0);
    const [a,b]=fish.map(({position})=>position);
    if (Math.abs(a.x-b.x)<.85) {
      samples++;
      minGap=Math.min(minGap,Math.abs(a.y-b.y));
    }
    assert.equal(fishContactsOverlap(actors[0].contact,actors[1].contact),false);
    for (const [i,{position}] of fish.entries()) {
      step.subVectors(position,previous[i]);
      assert.ok(step.length()>.01,'Both fish keep swimming during the pass');
      if (frame>0) assert.ok(step.angleTo(lastStep[i])<.07,'The course changes gradually');
      lastStep[i].copy(step);
      previous[i].copy(position);
    }
  }
  assert.ok(samples>15 && fish[0].position.x>1 && fish[1].position.x<-1);
  assert.ok(minGap>.50,`The passing fish left only ${minGap} units of vertical separation`);
});

test('fish, resident turtles and mobile invertebrates leave room for one another', async () => {
  const [THREE,{makeFish},{makeTurtles},{makeInhabitants},{createFoodSimulation},
    {aquariumResources,seededRandom},{floorAt},{fishContactsOverlap}] = await Promise.all([
    import('../node_modules/three/build/three.module.js'),
    import('../src/renderer/aquarium-fish.mjs'),
    import('../src/renderer/aquarium-turtles.mjs'),
    import('../src/renderer/aquarium-inhabitants.mjs'),
    import('../src/renderer/aquarium-feeding.mjs'),
    import('../src/renderer/aquarium-materials.mjs'),
    import('../src/renderer/aquarium-habitat.mjs'),
    import('../src/renderer/aquarium-fish-contact.mjs'),
  ]);
  const scene=new THREE.Scene(), resources=aquariumResources();
  const settings=normalizeAquarium({quality:'eco',turtleVisits:'resident',
    stock:{clown:4,anthias:9,tang:2,ray:1,greenTurtle:1,jelly:2,cuttlefish:2}});
  const random=seededRandom(27431);
  const width=9, visibleWidth=(z)=>width*(1-z/17.5);
  const visitors=[], swimmingContacts=new Map();
  const options={visibleWidth,visitors,swimmingContacts};
  const food=createFoodSimulation({random,floor:floorAt});
  const uniforms={tankTime:{value:0}};
  try {
    const swim=makeFish(scene,resources,uniforms,settings,random,width,[],food,options);
    const fish=[...swimmingContacts.values()];
    const tour=makeTurtles(scene,resources,uniforms,settings,random,visibleWidth,options);
    tour(0,1);
    const roam=makeInhabitants(scene,resources,uniforms,settings,random,width,[],food,{...options,swimmers:[...scene.children]});
    const [turtle]=visitors;
    assert.ok(fish.every(({mesh})=>mesh.visible) && visitors.every(({node})=>node.visible));
    let left=Infinity,right=-Infinity,encounters=0;
    const delta=1/40;
    for (let tick=0; tick<2000; tick++) {
      const time=tick*delta;
      uniforms.tankTime.value=time;
      if (tick===320 || tick===1180) food.drop(2,-4,7.25,'flakes',3);
      food.step(delta);
      tour(time,1);
      swim(delta,1);
      roam(time,delta,1);
      left=Math.min(left,turtle.node.position.x);
      right=Math.max(right,turtle.node.position.x);
      for (const swimmer of fish) for (const {node,contact} of visitors) {
        if (!node.visible || swimmer.contact.center.distanceToSquared(contact.center)>9) continue;
        encounters++;
        assert.equal(fishContactsOverlap(swimmer.contact,contact),false);
      }
    }
    assert.ok(encounters>50 && left<-5 && right>5);
  } finally {
    resources.dispose();
  }
});

test('reef growth and bubble controls support zero and old preset stocking retains custom choices', () => {
  const oldReef={clown:4,tang:3,anthias:11,cardinal:4,cleaner:2,hermit:2,star:3,urchin:2};
  const upgraded=normalizeAquarium({stock:oldReef,algaeDensity:0,coralDensity:900,spongeDensity:0,bubbleDensity:0,rockStyle:'slate'});
  assert.deepEqual([upgraded.algaeDensity,upgraded.coralDensity,upgraded.spongeDensity,upgraded.bubbleDensity],[0,100,0,0]);
  assert.equal(upgraded.rockStyle,'slate');
  assert.deepEqual([upgraded.stock.greenTurtle,upgraded.stock.mussel],[1,3]);
  const changed=normalizeAquarium({stock:{...oldReef,tang:1}});
  assert.deepEqual([changed.stock.tang,changed.stock.greenTurtle,changed.stock.mussel],[1,0,0]);
  assert.equal(normalizeAquarium({stock:{...oldReef,greenTurtle:0}}).stock.greenTurtle,0);
  const river=applyAquariumPreset(upgraded,'river');
  assert.deepEqual([river.coralDensity,river.spongeDensity,river.bubbleDensity],[0,0,0]);
});

test('occasional turtle visits leave a quiet interval and frequent passes return earlier', async () => {
  const {turtlePass}=await import('../src/renderer/aquarium-turtles.mjs');
  assert.equal(turtlePass(1,'occasional',0),null);
  assert.ok(turtlePass(13,'occasional',0).progress>.4);
  assert.equal(turtlePass(34,'occasional',0),null);
  assert.ok(turtlePass(34,'frequent',0));
  assert.equal(turtlePass(12,'occasional',2),null);
  assert.equal(turtlePass(68,'occasional',0).direction,-1);
});
