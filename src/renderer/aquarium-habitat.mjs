import * as THREE from '../../node_modules/three/build/three.module.js';
import { placeInstances, placeMesh, seededRandom, waterLit } from './aquarium-materials.mjs';
import { makeSeaweed, makeSponges } from './aquarium-growth.mjs';

const BEDS = {
  aragonite: { sand: '#cbb79a', rock: '#737c6c', pebbles: ['#a5a391', '#778e85', '#e0c5a3', '#697572', '#8c8277'] },
  basalt: { sand: '#666d64', rock: '#626e61', pebbles: ['#867c67', '#6e7d6b', '#3c4944', '#938e76', '#566661'] },
  gravel: { sand: '#766754', rock: '#715744', pebbles: ['#ae8b60', '#826450', '#5b574b', '#b6a07b', '#686551'] },
  pink: { sand: '#d8b6a4', rock: '#8e8376', pebbles: ['#c98c83','#d1b7aa','#eee0c5','#a17f77','#ad9696'] },
  silt: { sand: '#4d4b41', rock: '#5c5a4d', pebbles: ['#797063','#72685b','#3e463d','#65524b','#424444'] },
};

const GROUNDS = {
  lagoon: [[-.88,-6.0,1.65], [-.69,-8.9,2.25], [-.46,-3.7,1.36], [-.23,-9.3,1.65],
    [.19,-8.6,1.54], [.49,-4.7,2.05], [.68,-7.6,2.5], [.87,-3.5,1.4]],
  canyon: [[-.86,-3.8,2.25], [-.72,-7.8,2.75], [-.52,-11,2.2], [-.3,-14,1.5],
    [.34,-12,2.1], [.57,-8.5,2.4], [.8,-5.3,2.7], [.97,-3,1.7]],
  roots: [[-.84,-5.3,1.65], [-.69,-8.2,1.7], [-.42,-11,1.36], [-.16,-7.9,1.4],
    [.28,-5.7,1.7], [.55,-9.1,1.25], [.76,-7,1.65], [.89,-4.3,1.1]],
  open: [[-.84,-9,1.05], [-.48,-13,1.22], [.52,-11,.95], [.87,-6,1.14]],
  shelf: [[-.90,-5.6,2.3],[-.73,-8.2,2.5],[-.55,-10.8,2.45],[-.26,-12.0,2.1],[-.02,-8.2,1.4],
    [.42,-9.5,2.2],[.69,-6.9,1.75],[.90,-3.3,1.22]],
  bank: [[-.92,-5.2,2.25],[-.75,-6.8,1.64],[-.60,-9,1.48],[-.38,-11.9,1.5],
    [-.14,-13.3,1.9],[.36,-13.6,1.46],[.71,-10.2,1.47],[.86,-7,1.55]],
};

function landforms(settings, random, visibleWidth) {
  const open = settings.layout === 'open';
  const canyon = settings.layout === 'canyon';
  const edge = [
    [-1.05, 8.7, canyon ? 3.45 : open ? 1.77 : 2.81],
    [-1.06, 3.4, open ? 1.14 : 2.30],
    [.99, 8.0, canyon ? 2.85 : open ? 1.51 : 2.35],
    [1.10, 2.9, open ? 1.26 : 1.93],
  ];
  const visible = (rows, plane) => rows.map(([x,z,size]) => {
    const j = (random()-.5)*.82;
    const offset = (random()-.5) * Math.min(1.25,visibleWidth(z)*.13);
    const limit = visibleWidth(z)*(plane==='front' ? .63 : .74);
    return { x:x*visibleWidth(z)*.97 + offset, z:z+j,
      size:Math.min(size,limit)*(.41+settings.rocks*.0101)*(.88+random()*.20), plane };
  });
  return [...visible(GROUNDS[settings.layout], 'middle'), ...visible(edge, 'front')];
}

export function floorAt(x, z) {
  const bank = .44*Math.sin(x*.22+z*.31) + .25*Math.cos(z*.41-x*.24);
  const ridges = .079*Math.sin(z*4.1+1.2*Math.sin(x*.65) + .64*Math.sin(x*1.9+z*.88));
  const back = .44 * Math.max(0,(-z-3)/15);
  return -.30 + bank + ridges + back;
}

function makeStone(kind) {
  const source = new THREE.IcosahedronGeometry(1, 4);
  // Vertex positions repeat at faces, giving the same sculpted silhouette on every face.
  const vertex = source.attributes.position;
  const point = new THREE.Vector3();
  for (let i = 0; i < vertex.count; i++) {
    point.fromBufferAttribute(vertex, i);
    const shape = 1 + .15*Math.sin(point.x*4.7+point.z*3.3) + .13*Math.sin(point.z*6.1-point.y*4.4)
      + .07*Math.cos(point.y*10.2+point.x*6.8);
    point.multiplyScalar(shape);
    point.y = Math.max(-.68, point.y) + .05*Math.sin(point.z*13+point.x*4);
    if (kind==='basalt') {
      const angle=Math.atan2(point.z,point.x);
      const edge=Math.cos((angle+Math.PI/6)%(Math.PI/3)-Math.PI/6);
      point.x*=.84+edge*.19;
      point.z*=.84+edge*.19;
      point.y=Math.min(.70,point.y*.93+Math.sin(point.z*4+point.x*3)*.13);
    } else if (kind==='slate') {
      point.y=point.y*.57 + point.x*.26 + .08*Math.sin(point.x*11+point.z*8);
      point.x*=1.19;
    } else {
      point.x*=1 + .10*Math.cos(point.z*11+point.y*7);
      point.y*=.87+.12*Math.cos(point.x*7+point.z*4);
    }
    vertex.setXYZ(i, point.x, point.y, point.z);
  }
  if (kind!=='limestone') source.computeVertexNormals();
  return source;
}

function shadowTexture(resources) {
  const image = document.createElement('canvas');
  image.width = image.height = 64;
  const ink = image.getContext('2d');
  const fade = ink.createRadialGradient(32,32,6,32,32,32);
  fade.addColorStop(0, '#091415');
  fade.addColorStop(.56, '#09141566');
  fade.addColorStop(1, '#09141500');
  ink.fillStyle = fade;
  ink.fillRect(0,0,64,64);
  return resources.keep(new THREE.CanvasTexture(image));
}

export function makeHabitat(scene, resources, uniforms, settings, random, visibleWidth, textures, obstacles) {
  const bed = BEDS[settings.substrate];
  const ridges = landforms(settings, random, visibleWidth);
  const sand = resources.keep(new THREE.PlaneGeometry(Math.max(105,visibleWidth(-35)*2.45),87,183,127));
  sand.rotateX(-Math.PI/2).translate(0, 0, -29);
  const vertex = sand.attributes.position;
  for (let i=0; i<vertex.count; i++) vertex.setY(i, floorAt(vertex.getX(i), vertex.getZ(i)));
  sand.computeVertexNormals();
  const sandMaterial = waterLit(resources, uniforms, { color:bed.sand, roughness:.93, normalMap:textures.sandNormal,
    normalScale:new THREE.Vector2(.39,.39) }, { grain:'sand' });
  placeMesh(scene,sand,sandMaterial,0,0,0);

  const stoneMaterial = waterLit(resources, uniforms, { color: '#ffffff', roughness: .95 }, { grain: 'rock' });
  const stones = [], shadows = [], scanned = [];
  const shadow = (x,z,size) => shadows.push({ position:[x, floorAt(x,z)+.054, z+.16],
    scale:[size*1.28,size*.89,1], rotation:[-Math.PI/2,0,0] });
  for (const { x, z, size, plane } of settings.rocks ? ridges : []) {
    const mound = plane === 'front' ? .81 : settings.layout === 'canyon' || settings.layout === 'shelf' ? .94 : .73;
    if (plane==='front' && ['mixed','coastal'].includes(settings.rockStyle) && textures.boulderGeometry && textures.boulderMap) {
      scanned.push({ position:[x,floorAt(x,z)-size*.24,z],scale:[size*1.26,size*1.09,size*.92],
        rotation:[(random()-.5)*.31,random()*6.28,(random()-.5)*.29],
        color:settings.substrate==='silt' ? '#aaa18a' : settings.substrate==='basalt' ? '#b5b9ae' : '#d9d6bf' });
    } else stones.push({ position:[x, floorAt(x,z)+size*.20, z], scale:[size*1.36,size*mound,size*.95],
      rotation:[random()*.64,random()*6.28,random()*.35], color: bed.rock });
    shadow(x,z,size*1.56);
    for (let i=0; i<Math.round(4+settings.rocks*.13); i++) {
      const angle = random()*Math.PI*2;
      const r = size*(.51+random()*1.39);
      const rx = x+Math.cos(angle)*r, rz = z+Math.sin(angle)*r*.87;
      const scale = size*(.15+random()*.34);
      stones.push({ position:[rx,floorAt(rx,rz)+scale*.09,rz], scale:[scale*1.32,scale*.64,scale],
        rotation:[random()*.38,random()*6.28,random()*.45], color: bed.pebbles[i%bed.pebbles.length] });
    }
  }
  const farCount = Math.round(settings.rocks*.29);
  for (let i=0; i<farCount; i++) {
    const z=-17.5-random()*19.4;
    const x=(i/Math.max(1,farCount-1)*2.26-1.13)*visibleWidth(z) + (random()-.5)*2.2;
    const size=Math.min(1.62+random()*3.10,1.24+visibleWidth(z)*.43);
    stones.push({ position:[x,floorAt(x,z)+size*.05,z],scale:[size*1.57,size*(.59+random()*.43),size],
      rotation:[random(),random()*6.28,random()*.47],color:bed.pebbles[i%bed.pebbles.length] });
  }
  const smallStone = resources.keep(new THREE.IcosahedronGeometry(1, 1));
  const pebbles = [];
  const count = settings.quality === 'eco' ? 240 : settings.quality === 'high' ? 610 : 400;
  for (let i=0; i<count; i++) {
    const z = -23+random()*34.7;
    const x = (random()*2-1)*visibleWidth(z)*1.13;
    const size = .031 + Math.pow(random(), 3) * (settings.substrate === 'gravel' ? .23 : .16);
    pebbles.push({ position:[x,floorAt(x,z),z], scale:[size*(1+random()*.65),size*(.36+random()*.36),size],
      rotation:[random()*.8,random()*6.28,random()*.65], color: bed.pebbles[i%bed.pebbles.length] });
  }
  const rockTypes=settings.rockStyle==='mixed' ? ['limestone','basalt','limestone','slate'] :
    [settings.rockStyle==='coastal' ? 'limestone' : settings.rockStyle];
  const rockGroups=new Map();
  for (const [i,part] of stones.entries()) {
    const kind=rockTypes[i%rockTypes.length];
    const colour=kind==='basalt' ? '#686b70' : kind==='slate' ? '#8c8985' : part.color;
    const group=rockGroups.get(kind) ?? [];
    group.push({...part,color:colour});
    rockGroups.set(kind,group);
  }
  for (const [kind,group] of rockGroups) {
    const rocks = placeInstances(scene,resources.keep(makeStone(kind)),stoneMaterial,group);
    rocks.castShadow=true;
    obstacles.add(rocks);
  }
  if (scanned.length) {
    const scannedMaterial=waterLit(resources,uniforms,{color:'#fff',map:textures.boulderMap,roughness:.94});
    const rocks = placeInstances(scene,textures.boulderGeometry,scannedMaterial,scanned);
    rocks.castShadow=true;
    obstacles.add(rocks);
  }
  placeInstances(scene, smallStone, stoneMaterial, pebbles);
  if (settings.quality !== 'eco') {
    const fragments=[];
    const fossil = waterLit(resources,uniforms,{color:'#fff',roughness:.83},{grain:'organic'});
    const shell = resources.keep(new THREE.SphereGeometry(1,11,7,0,Math.PI*2,0,Math.PI*.49));
    for (let i=0; i<72; i++) {
      const z=-7+random()*17.7, x=(random()*2-1)*visibleWidth(z)*1.07, size=.045+random()*.16;
      fragments.push({position:[x,floorAt(x,z)+.021,z],scale:[size,size*.22,size*.74],
        rotation:[(random()-.5)*.29,random()*6.28,(random()-.5)*.39],color:['#a8a383','#ad8d87','#d0b699','#a7a69a'][i%4]});
    }
    placeInstances(scene,shell,fossil,fragments);
  }
  placeInstances(scene, resources.keep(new THREE.PlaneGeometry(2,2)), resources.keep(new THREE.MeshBasicMaterial({
    color: '#9c9c9c', map: shadowTexture(resources), transparent: true, depthWrite: false, opacity: .68,
  })), shadows);
  if (settings.rocks && (settings.layout === 'roots' || settings.layout === 'bank')) makeRoots(scene, resources, uniforms, ridges, random, obstacles);
  if (settings.coralDensity) {
      const density=settings.coralDensity;
      const coverage=settings.growth==='coralGarden' ? .46+density*.015 : density*.014;
      const front=ridges.filter(({plane})=>plane==='front');
      const middle=ridges.filter(({plane})=>plane==='middle');
      const banks=[...middle.slice(0,Math.max(1,Math.round(middle.length*Math.min(1,coverage)))),
        ...front.slice(0,Math.round(front.length*Math.min(1,coverage+.20)))];
      const fill=Math.round(banks.length*Math.max(0,density-47)/52);
      const clusters=banks.slice(0,fill).map(({x,z,size,plane},i)=>({
        x:x+Math.sin(i*2.39996)*size*.83,z:z+size*.64+.31,size:size*(.41+(i%3)*.08),plane,
      }));
      makeReef(scene,resources,uniforms,[...banks,...clusters],seededRandom(settings.seed^1447),settings.quality,settings.coralStyle,density,obstacles);
  }
  if (settings.plants) {
    const reef=settings.growth==='corals'||settings.growth==='coralGarden';
    makePlants(scene,resources,uniforms,ridges,seededRandom(settings.seed^6157),reef?'meadow':settings.growth,
      visibleWidth,reef?settings.plants*.46:settings.plants);
  }
  makeSeaweed(scene,resources,uniforms,seededRandom(settings.seed^7139),settings,ridges,visibleWidth,floorAt);
  makeSponges(scene,resources,uniforms,seededRandom(settings.seed^95959),settings,ridges,visibleWidth,floorAt);
  return settings.rocks ? ridges : ridges.map(({ x,z })=>({x,z,size:.08}));
}

function makeRoots(scene, resources, uniforms, ridges, random, obstacles) {
  const bark = waterLit(resources, uniforms, { color: '#6d5040', roughness: .97 }, { grain: 'rock' });
  for (const { x, z, size } of ridges.filter((_, index) => index%2===0)) {
    const base = floorAt(x,z);
    for (let j=0; j<6; j++) {
      const direction = j%2 ? 1 : -1;
      const stretch = size*(.4+random()*1.2)*direction;
      const height = size*(1.65 + random() * 1.7);
      const branch = new THREE.CatmullRomCurve3([
        new THREE.Vector3(x,base-.15,z), new THREE.Vector3(x+stretch*.12,base+.85,z-.4),
        new THREE.Vector3(x+stretch*.79,base+height*.7,z-.84+random()*1.4),
        new THREE.Vector3(x+stretch*1.18,base+height,z-1.2+random()*1.8),
      ]);
      const geometry = new THREE.TubeGeometry(branch, 18, .13+random()*.19, 7);
      const rings = geometry.attributes.position;
      const center = new THREE.Vector3();
      const point = new THREE.Vector3();
      for (let i=0; i<rings.count; i++) {
        const along = Math.floor(i/8)/18;
        branch.getPointAt(along, center);
        point.fromBufferAttribute(rings,i).lerp(center, along*.92);
        rings.setXYZ(i,point.x,point.y,point.z);
      }
      geometry.computeVertexNormals();
      const root = placeMesh(scene,resources.keep(geometry),bark,0,0,0);
      root.castShadow=true;
      obstacles.add(root);
    }
  }
}

function connect(parts, a, b, radius, color) {
  const delta = new THREE.Vector3().subVectors(b,a);
  parts.push({ position:a.clone().lerp(b,.5).toArray(), scale:[radius,delta.length()*1.07,radius],
    quaternion:new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),delta.normalize()), color });
}

function makeReef(scene, resources, uniforms, ridges, random, quality, style, density, obstacles) {
  const branches=[], polyps=[], shelves=[], colonies=[], brains=[];
  const stems=[], tips=[], mounds=[];
  const colors=[['#a5644e','#d59c73'],['#a45a69','#dc9ba5'],['#6b638e','#bb9fd4'],['#9d8657','#dcc079'],
    ['#668173','#a5b686'],['#995c54','#dca196']];
  const coral=waterLit(resources,uniforms,{color:'#ffffff',roughness:.84},{grain:'coral'});
  const detailed = quality !== 'eco';
  for (const [index, { x, z, size, plane }] of ridges.entries()) {
    const height = floorAt(x,z) + size*.52;
    const [base, pink] = colors[index%colors.length];
    const start = new THREE.Vector3(x-.39, height, z+.45);
    const fan=style==='soft'||(style==='mixed'&&index%3===1);
    const foreground=plane==='front';
    const primaryScale=size*(foreground ? .68 : fan ? 1.00 : 1.05);
    function grow(origin, direction, length, radius, depth) {
      const elbow = origin.clone().addScaledVector(direction,length*.51);
      elbow.x += (random()-.5)*length*.22;
      const tip = elbow.clone().addScaledVector(direction,length*.51);
      connect(branches,origin,elbow,radius,base);
      connect(branches,elbow,tip,radius*.81,depth===0 ? pink : base);
      if (depth === 0) {
        if (detailed) polyps.push({ position: tip.toArray(), scale:[radius*1.44,radius*1.57,radius*1.44], color:pink });
        return;
      }
      for (const sign of [-1,1]) {
        const child = direction.clone().multiplyScalar(.63);
        child.x += sign*(fan ? .49 : .33) + (random()-.5)*.29;
        child.y += .47 + random()*.31;
        child.z += (random()-.5)*(fan ? .21 : .96);
        grow(tip,child.normalize(),length*(.52+random()*.23),radius*.65,depth-1);
      }
    }
    const branchesPerColony=style==='plates' ? 2 : fan ? 7+Math.round(density*.035) :
      (style==='branching'?6:4)+Math.round(density*.041);
    for (let j=0; j<branchesPerColony; j++) {
      const firstBranch=branches.length, firstPolyp=polyps.length;
      const d = j/(branchesPerColony-1)*2-1;
      const direction = new THREE.Vector3(d*(fan ? 1.03 : .67), .91-Math.abs(d)*.36, (random()-.5)*(fan ? .19 : .69));
      grow(start,direction.normalize(),primaryScale*(.68+random()*.26),
        size*(fan ? .021 : .050)*(foreground ? .82 : 1),fan && detailed ? 4 : 3);
      stems.push([firstBranch,branches.length]);
      if (detailed) tips.push([firstPolyp,polyps.length]);
    }
    const shelvesPerColony=style==='plates' ? 9 : style==='soft' ? 2 : 5+Math.round(density*.022);
    for (let j=0; j<shelvesPerColony; j++) {
      const px = x + size*(.46+j*.17) - .1, pz = z+size*.62-j*.12;
      const span = size*(.49-j*.042);
      shelves.push({ position:[px, height*.5+j*.126+.35, pz], scale:[span,span*.32,span],
        rotation:[.09*(random()-.5),random()*6.2,.28*(random()-.5)],color:j%2 ? base : pink });
    }
    const clusters=style==='soft' ? 2 : style==='branching' ? 3 : 3+Math.round(density*.022);
    for (let colony=0;colony<clusters;colony++) {
      const first=colonies.length;
      const px=x+size*(.29+.38*colony), pz=z+size*(.66+.21*colony);
      const at=floorAt(px,pz)+size*(colony===0?.28:.14);
      const mound=size*(.37+random()*.16);
      const lobes=detailed ? 34+Math.round(density*.19) : 26;
      if (style==='plates' || (style==='mixed' && colony%3===0)) brains.push({
        position:[px,at,pz],scale:[mound*.93,mound*.71,mound*.92],rotation:[0,random()*6.28,0],color:pink,
      });
      for (let j=0;j<lobes;j++) {
        const radius=Math.sqrt(j/lobes), a=j*2.399963;
        const s=(.13+random()*.13)*mound;
        const ripple=1+.21*Math.cos(a*4.1);
        colonies.push({position:[px+Math.cos(a)*radius*mound*ripple,at+(1-radius*radius*.78)*mound*.57,
          pz+Math.sin(a)*radius*mound*.79],scale:[s*1.3,s*.82,s*1.19],color:j%7===0 ? base : pink });
      }
      mounds.push([first,colonies.length]);
    }
  }
  const cylinder = resources.keep(new THREE.CylinderGeometry(.61,1,1,6));
  const bulb = resources.keep(new THREE.IcosahedronGeometry(1,1));
  const skeletons=placeInstances(scene,cylinder,coral,branches);
  if (skeletons) skeletons.castShadow=true;
  obstacles.add(skeletons,stems);
  obstacles.add(placeInstances(scene,bulb,coral,polyps),tips);
  obstacles.add(placeInstances(scene,bulb,coral,colonies),mounds);
  obstacles.add(placeInstances(scene,resources.keep(new THREE.SphereGeometry(1,17,12)),coral,brains));
  obstacles.add(placeInstances(scene,resources.keep(shelfGeometry()),coral,shelves));
  for (const [index, { x,z,size }] of ridges.entries()) {
    if (index%(style==='soft' ? 1:3)) continue;
    const px=x-size*.55, pz=z+size*1.27;
    const base = floorAt(px,pz);
    const anemone = new THREE.Group();
    anemone.position.set(px,base,pz);
    scene.add(anemone);
    const foot = waterLit(resources, uniforms, { color:'#947b58', roughness:.72 });
    obstacles.add(placeMesh(anemone, bulb,foot,0,.17,0,.61,.25,.61));
    const material = waterLit(resources, uniforms, { color:'#ffffff', roughness:.65, side:THREE.DoubleSide,
      vertexColors:true }, { grain:'organic', sway:.055 });
    placeMesh(anemone, resources.keep(bladesGeometry(random, 45, 'anemone')), material, 0,.13,0);
  }
}

export function makeCoralThicket(scene,resources,uniforms,random,quality,obstacles) {
  makeReef(scene,resources,uniforms,[{x:0,z:0,size:1.32,plane:'middle'}],random,quality,'mixed',88,obstacles);
}

function shelfGeometry() {
  const plate = new THREE.LatheGeometry([[0,.10],[.21,.12],[.58,.20],[.86,.31],[1,.39],
    [.92,.47],[.63,.35],[.32,.25],[0,.24]].map(([x,y])=>new THREE.Vector2(x,y)), 36);
  const v = plate.attributes.position;
  for (let i=0; i<v.count;i++) {
    const x=v.getX(i), y=v.getY(i), z=v.getZ(i);
    const angle=Math.atan2(z,x), r=Math.hypot(x,z);
    const slop=1+.09*Math.sin(angle*6)+.08*Math.cos(angle*11);
    v.setXYZ(i,x*slop,y+.1*r*Math.sin(angle*5),z*slop);
  }
  plate.computeVertexNormals();
  return plate;
}

function bladesGeometry(random, count, kind) {
  const positions = [], colors = [], indices = [];
  const long = kind === 'kelp', tentacle = kind === 'anemone';
  const broad=kind==='plantedGarden'||kind==='stemGarden', grass=kind==='meadow'||kind==='eelgrass';
  const palette = (long ? ['#667d34','#a58b42','#39562e','#8d8b44'] : tentacle
    ? ['#b8ab75','#aa9d71','#d2b491','#aaca99'] : ['#5f7739','#87984c','#486848','#789d59']).map((color)=>new THREE.Color(color));
  const tint = new THREE.Color();
  const steps = long ? 20 : 12;
  for (let blade=0; blade<count; blade++) {
    const angle=random()*Math.PI*2, dx=Math.cos(angle), dz=Math.sin(angle);
    const root = tentacle ? .09+Math.sqrt(random())*.52 : random()*.57;
    const height=long ? 3.05+random()*3.65 : tentacle ? .22+random()*.40
      : kind==='eelgrass' ? .85+random()*1.40 : grass ? .36+random()*.96 : .51+random()*2.21;
    const bend = long ? .25+random()*1.9 : tentacle ? .2+random()*.44 : .34+random()*.88;
    const width = long ? .16+random()*.22 : tentacle ? .04+random()*.027 : broad ? .23+random()*.27
      : grass ? .019+random()*.09 : .082+random()*.18;
    const hue=palette[blade%palette.length];
    const offset=positions.length/3;
    for (let i=0; i<=steps; i++) {
      const u=i/steps;
      const wave=(bend*u*u + Math.sin(u*13+blade)*u*.12) * (tentacle ? .79 : 1);
      const radius=root+wave;
      const leafWidth=tentacle ? width*(1-.43*u) : width*Math.pow(Math.sin(Math.PI*u),broad?.99:.60)*(1+.19*Math.sin(u*29));
      const heightAt = tentacle ? height*Math.sin(u*2.15) : height*(u-.12*u*u);
      for (const edge of [-1,-.5,0,.5,1]) {
        const fold=(1-edge*edge)*leafWidth*.34 + edge*leafWidth*.22*Math.sin(u*13+blade);
        positions.push(dx*radius-dz*edge*leafWidth,heightAt+fold,dz*radius+dx*edge*leafWidth);
        const vein=.86+.08*Math.sin(u*61+blade)+.14*(1-Math.abs(edge));
        tint.copy(hue).multiplyScalar((.48+.68*u)*vein);
        if (tentacle && u>.76) tint.lerp(palette[2], u*.39).multiplyScalar(1.3);
        colors.push(tint.r,tint.g,tint.b);
      }
      if (i) for (let side=0;side<4;side++) {
        const a=offset+(i-1)*5+side;
        indices.push(a,a+5,a+1,a+1,a+5,a+6);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function makePlants(scene, resources, uniforms, ridges, random, kind, visibleWidth, density) {
  const minimal=kind==='sparse';
  const count=Math.max(1,Math.round((minimal ? 12 : kind==='meadow' ? 61 : 43)*density/100));
  const types=kind==='mixedPlants' ? ['eelgrass','plantedGarden','stemGarden','riverPlants'] : [kind];
  const batches=Object.fromEntries(types.map(type=>[type,[[],[],[]]]));
  for (let i=0; i<count; i++) {
    const type=types[i%types.length];
    const bank=ridges[i%ridges.length];
    const z=(i<ridges.length) ? bank.z-.6-random()*2.1 : -23+random()*33.2;
    const x=(i<ridges.length) ? bank.x+(random()-.5)*2.8 : (random()*2-1)*visibleWidth(z)*1.01;
    const size=i<ridges.length ? .91+random()*.65 : .22+random()*(type==='kelp' ? .83 : .72);
    batches[type][Math.floor(i/types.length)%3].push({ position:[x,floorAt(x,z)-.02,z],
      scale:[size,size,size],rotation:[0,random()*6.28,0] });
  }
  for (const [type,groups] of Object.entries(batches)) {
    const material=waterLit(resources,uniforms,{color:'#fff',roughness:.81,side:THREE.DoubleSide,vertexColors:true},
      {grain:'organic',sway:type==='kelp'?.127:.195});
    for (const group of groups.filter((entries)=>entries.length)) {
      placeInstances(scene,resources.keep(bladesGeometry(random,type==='kelp'?11:20,type)),material,group);
    }
  }
}
