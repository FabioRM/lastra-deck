'use strict';

const assert = require('node:assert/strict');
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
