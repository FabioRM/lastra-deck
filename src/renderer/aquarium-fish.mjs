import * as THREE from '../../node_modules/three/build/three.module.js';
import { floorAt } from './aquarium-habitat.mjs';
import { placeMesh } from './aquarium-materials.mjs';

const FISH = {
  clown: { shape:[.33,.205,.45,.27,.31], palette:['#ef7925','#ffeac2','#1d1820'], size:.72, speed:1.32, pattern:0, route:'reef' },
  tang: { shape:[.48,.155,.42,.38,.43], palette:['#2875dc','#f6d743','#142648'], size:1.08, speed:.82, pattern:1, route:'roam' },
  anthias: { shape:[.26,.11,.44,.19,.34], palette:['#df792a','#ffcb7f','#a6456b'], size:.49, speed:1.05, pattern:2, route:'school' },
  cardinal: { shape:[.35,.125,.42,.35,.40], palette:['#b2a48a','#e1dac2','#272234'], size:.59, speed:.79, pattern:3, route:'reef' },
  sardine: { shape:[.20,.11,.4,.14,.30], palette:['#75958d','#deebe6','#213e46'], size:.58, speed:1.24, pattern:4, route:'school' },
  rockfish: { shape:[.34,.175,.49,.33,.29], palette:['#a65c36','#de9d62','#312525'], size:1.07, speed:.64, pattern:5, route:'reef' },
  tetra: { shape:[.22,.104,.35,.15,.27], palette:['#183e53','#5ce7ff','#d74753'], size:.50, speed:1.17, pattern:6, route:'school' },
  discus: { shape:[.59,.145,.28,.42,.42], palette:['#ce5634','#e99f58','#4f292d'], size:1.11, speed:.66, pattern:7, route:'roam' },
  cory: { shape:[.27,.154,.42,.23,.29], palette:['#aa8f56','#ddd5aa','#364b42'], size:.57, speed:.62, pattern:8, route:'bottom' },
  blackClown: { shape:[.36,.21,.42,.28,.34], palette:['#251d21','#fff4da','#08070e'], size:.72, speed:1.22, pattern:0, route:'reef' },
  yellowTang: { shape:[.49,.12,.32,.44,.36], palette:['#f7cd29','#fff197','#b6861a'], size:1.01, speed:.91, pattern:9, route:'roam' },
  regal: { shape:[.37,.14,.31,.39,.32], palette:['#daa236','#b8dded','#353b79'], size:1.08, speed:.83, pattern:10, route:'roam' },
  mandarin: { shape:[.26,.18,.35,.37,.35], palette:['#1b9a9c','#dfa636','#343b91'], size:.62, speed:.63, pattern:11, route:'bottom' },
  gramma: { shape:[.26,.128,.40,.27,.26], palette:['#aa379a','#f6be33','#3d195e'], size:.60, speed:.96, pattern:12, route:'reef' },
  flame: { shape:[.41,.132,.33,.30,.31], palette:['#eb5b20','#f49b35','#302340'], size:.78, speed:.86, pattern:13, route:'reef' },
  butterfly: { shape:[.45,.106,.29,.34,.29], palette:['#efeee1','#dc8d41','#292432'], size:.91, speed:.81, pattern:14, route:'reef', fins:'beak' },
  moorish: { shape:[.43,.109,.31,.46,.35], palette:['#eceadc','#efcf59','#242631'], size:1.00, speed:.80, pattern:15, route:'roam', fins:'streamer' },
  guppy: { shape:[.23,.11,.52,.20,.54], palette:['#437fba','#f9a247','#37316c'], size:.46, speed:.93, pattern:16, route:'school', fins:'fan' },
  betta: { shape:[.28,.13,.55,.35,.72], palette:['#4252c7','#d96093','#29306a'], size:.71, speed:.52, pattern:17, route:'reef', fins:'veil' },
  rummy: { shape:[.19,.099,.39,.17,.25], palette:['#9bbab0','#db4b4a','#39454b'], size:.48, speed:1.21, pattern:18, route:'school' },
  goldfish: { shape:[.37,.20,.54,.33,.63], palette:['#ea6a29','#ffd3a2','#ae3828'], size:.91, speed:.72, pattern:19, route:'roam', fins:'veil' },
  angel: { shape:[.58,.101,.33,.53,.40], palette:['#c9c9b1','#f2e0a6','#3b4140'], size:.86, speed:.64, pattern:20, route:'reef', fins:'filaments' },
  koi: { shape:[.28,.19,.46,.215,.34], palette:['#eee1cd','#e95335','#5e5456'], size:1.27, speed:.71, pattern:21, route:'roam' },
};

function fishGeometry(species, detailed) {
  const [height, thickness, tailLength, dorsal, tailWidth] = species.shape;
  const positions = [], pieces = [], indices = [];
  const register = (point, kind) => {
    const index = positions.length/3;
    positions.push(...point);
    pieces.push(kind);
    return index;
  };
  const ringCount = detailed ? 30 : 21, sideCount = detailed ? 26 : 18;
  for (let ring=0; ring<=ringCount; ring++) {
    const t=ring/ringCount, x=-.74+1.68*t + (species.fins === 'beak' ? .19*t**7 : 0);
    const envelope = Math.pow(Math.max(.004, Math.sin(Math.PI*t)), .72)*(.63+t*.47);
    const peduncle = .065 * (1 - Math.min(t/.22,1));
    for (let i=0; i<=sideCount; i++) {
      const a=i/sideCount*Math.PI*2;
      const belly=Math.cos(a)>0 ? 1 : .88;
      register([x, .045*t + Math.cos(a)*(height*envelope*belly+peduncle), Math.sin(a)*(thickness*envelope+peduncle*.75)],0);
      if (ring && i) {
        const k=positions.length/3-1;
        indices.push(k-sideCount-2,k-sideCount-1,k-1,k-1,k-sideCount-1,k);
      }
    }
  }

  function membrane(origin, points, kind) {
    const center = register(origin, kind);
    const ridge = points.map((point) => register(point.map((component, i) => component*.56+origin[i]*.44+Number(i===2)*.036),kind));
    const outer = points.map((point)=>register(point,kind));
    for (let i=0; i<points.length-1; i++) indices.push(center,ridge[i],ridge[i+1],ridge[i],outer[i],outer[i+1],ridge[i],outer[i+1],ridge[i+1]);
  }

  const end = -.77-tailLength;
  if (species.fins === 'fan' || species.fins === 'veil') {
    const fringe = Array.from({ length: 25 }, (_, index) => {
      const angle = (index / 24 - .5) * Math.PI * 1.16;
      const fold = 1 + .09 * Math.cos(index * 2.3);
      return [-.77 - Math.cos(angle) * tailLength * fold, Math.sin(angle) * tailWidth * fold,
        Math.sin(index * .76) * .065 * Math.cos(angle)];
    });
    membrane([-.65,0,0], [[-.73,-.07,0],...fringe,[-.73,.07,0]], 1);
  } else membrane([-.65,0,0], [[-.74,.069,0],[end+.12,tailWidth*.85,0],[end,tailWidth,0],
    [end+.082,tailWidth*.49,.016],[end+tailLength*.51,0,.019],[end+.05,-tailWidth*.59,0],
    [end,-tailWidth*.84,0],[end+.13,-tailWidth*.72,0],[-.74,-.068,0]],1);

  const dorsalCount=species.pattern===5 ? 18 : (detailed ? 15 : 9);
  const upper=[], lower=[];
  for (let i=0;i<=dorsalCount;i++) {
    const t=i/dorsalCount, x=.61-t*1.28;
    const shape=Math.pow(Math.max(0,Math.sin(Math.PI*t)),.75)*(1-.41*t);
    const serration=species.pattern===5 ? (i%2 ? .72 : 1.18) : (i%2 ? .93 : 1);
    const sail = species.fins === 'streamer' || species.fins === 'filaments' ? Math.exp(-((t - .36)**2) / .031) * .59 : 0;
    upper.push([x - sail * .42,height*(.36+shape*.65)+dorsal*shape*serration+sail,.013*Math.sin(t*8)]);
    lower.push([x-.21,-.17-shape*(height*.49+dorsal*.34)-(species.fins === 'veil' ? shape*.29 : 0),.012*Math.cos(t*7)]);
  }
  membrane([.18,height*.48,0],upper,2);
  membrane([-.16,-height*.51,0],lower,2);
  for (const side of [-1,1]) {
    const base=thickness*.85*side;
    membrane([.37,-height*.33,base], [[.40,-height*.27,base],[.16,-height*.34,base*1.47],[-.05,-height*.86,base*2.03],
      [.07,-height*1.01,base*1.97],[.29,-height*.66,base*1.38],[.40,-height*.48,base]],2);
    if (species.fins === 'filaments') membrane([.43,-.31,base], [[.44,-.34,base],[.40,-.64,base*.89],
      [.13,-1.14,base*.8],[.15,-.76,base],[.30,-.39,base]], 2);
    // Cornea, iris and pupil use the same draw call and follow the body deformation.
    const eyeRadius = species.pattern===3 ? .103 : species.pattern===4 ? .079 : .075;
    const centerZ = thickness*.64*side;
    appendBall(.66, height*.34, centerZ, eyeRadius * 1.15, eyeRadius*1.18, eyeRadius*.56, 3);
    appendBall(.677, height*.35, centerZ+side*eyeRadius*.42, eyeRadius*.70, eyeRadius*.73, eyeRadius*.35, 4);
    appendBall(.700, height*.39, centerZ+side*eyeRadius*.67, eyeRadius*.22, eyeRadius*.23, eyeRadius*.10, 5);
  }
  function appendBall(x,y,z,sx,sy,sz,kind) {
    const shape=new THREE.SphereGeometry(1,10,6);
    const attr=shape.attributes.position, start=pieces.length;
    for (let i=0; i<attr.count; i++) register([x+attr.getX(i)*sx,y+attr.getY(i)*sy,z+attr.getZ(i)*sz],kind);
    for (const i of shape.index.array) indices.push(start+i);
    shape.dispose();
  }
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  geometry.setAttribute('fishPart',new THREE.Float32BufferAttribute(pieces,1));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  geometry.boundingSphere.radius += .25;
  return geometry;
}

const pigmentShader = /* glsl */`
  varying vec3 fishBody;
  varying float fishRegion;
  uniform vec3 baseColor;
  uniform vec3 paleColor;
  uniform vec3 darkColor;
  uniform float tankTime;
  uniform float tankLight;
  float stripe(float x, float center, float size) {
    return 1. - smoothstep(size*.83, size, abs(x-center));
  }
  vec3 paintFish(float x,float y,float z,float region) {
    float belly=1.-smoothstep(-.39,.23,y);
    float scaleX=(x+y*.17)*49.;
    float scaleY=y*59.;
    float stagger=mod(floor(scaleX),2.)*.5;
    float sheet=1.-smoothstep(.25,1.2,max(fwidth(scaleX),fwidth(scaleY)));
    float pattern=pow(max(0.,sin(scaleX*3.14159)*sin((scaleY+stagger)*3.14159)),3.)*sheet;
    float skin=1. + .15*pattern + .08*sin(x*38.+sin(y*18.)*2.)*.5;
    vec3 pigment=mix(baseColor,paleColor,.23*belly);
    #if FISH_PATTERN == 0
      float marks = x + y*.19 + cos(y*10.+x*4.)*.04;
      float outline=max(stripe(marks,.46,.131),max(stripe(marks,-.03,.147),stripe(marks,-.61,.11)));
      float bar=max(stripe(marks,.46,.102),max(stripe(marks,-.03,.114),stripe(marks,-.61,.082)));
      pigment=mix(pigment,darkColor,outline);
      pigment=mix(pigment,paleColor,bar);
    #elif FISH_PATTERN == 1
      float saddle=(1.-smoothstep(.19,.24,abs(y-.13-sin(x*4.)*.13)))*(1.-smoothstep(.44,.62,x));
      pigment=mix(baseColor,darkColor,max(saddle*.93,smoothstep(.21,.45,y)*.72));
      pigment=mix(pigment,paleColor,1.-smoothstep(-.71,-.63,x));
    #elif FISH_PATTERN == 2
      pigment=mix(baseColor,mix(paleColor,darkColor,smoothstep(-.05,.28,y)),.39 + .30*sin(x*2.3-y*3.));
    #elif FISH_PATTERN == 3
      float a=x+y*.34;
      float bars=max(stripe(a,.57,.084),max(stripe(a,.07,.077),stripe(a,-.43,.094)));
      pigment=mix(pigment,darkColor,bars);
      float dots=pow(max(0.,sin(x*51.+sin(y*29.))*sin(y*43.+z*18.)),12.);
      pigment=mix(pigment,paleColor,dots*.90);
    #elif FISH_PATTERN == 4
      pigment=mix(paleColor,baseColor,smoothstep(-.1,.16,y));
      pigment=mix(pigment,darkColor,smoothstep(.04,.2,y)*.78);
      pigment=mix(pigment,paleColor,stripe(y,-.02,.034)*.48);
      pigment*=1.+.23*pattern;
    #elif FISH_PATTERN == 5
      float mottling=sin(x*14.+sin(y*23.)+z*6.)*sin(y*18.-x*12.+z*15.);
      pigment=mix(pigment,darkColor,smoothstep(.14,.72,mottling)*.69+.15*smoothstep(-.04,.2,y));
    #elif FISH_PATTERN == 6
      float red=(1.-smoothstep(-.02,.06,x))*(1.-smoothstep(-.04,.04,y))*.95;
      float neon=stripe(y,.069+sin(x*.99)*.029,.042)*(1.-smoothstep(.65,.88,x));
      pigment=mix(mix(baseColor,darkColor,red),paleColor,neon*.96);
    #elif FISH_PATTERN == 7
      float bands=pow(.5+.5*cos(x*25.+sin(y*8.+x*3.)*.9),3.);
      float contour=pow(.5+.5*sin(y*40.+cos(x*9.)*2.8),5.);
      pigment=mix(mix(baseColor,paleColor,contour*.45),darkColor,.46*bands);
    #elif FISH_PATTERN == 8
      float band=stripe(y,.078+sin(x*2.)*.13,.125);
      pigment=mix(mix(baseColor,paleColor,belly*.66),darkColor,band*.77);
    #elif FISH_PATTERN == 9
      pigment=mix(baseColor,paleColor,.48*belly);
      pigment=mix(pigment,darkColor,smoothstep(.32,.49,y)*.58);
    #elif FISH_PATTERN == 10 || FISH_PATTERN == 13 || FISH_PATTERN == 14 || FISH_PATTERN == 20
      float bands=pow(.5+.5*cos(x*(FISH_PATTERN == 10 ? 27. : 18.) + y*3. + sin(7.*y)*.65),5.);
      pigment=mix(baseColor,FISH_PATTERN == 14 ? paleColor : darkColor,bands*.86);
      #if FISH_PATTERN == 10
        pigment=mix(pigment,paleColor,pow(bands,4.)*.84);
      #elif FISH_PATTERN == 14
        pigment=mix(pigment,darkColor,max(stripe(x,.68,.062),stripe(x,-.50,.07)*smoothstep(.11,.33,y)));
      #endif
    #elif FISH_PATTERN == 11
      float maze=sin(x*17.+sin(y*32.)*2.) * cos(y*27.+sin(x*15.)*1.7);
      pigment=mix(baseColor,paleColor,smoothstep(.18,.61,maze));
      pigment=mix(pigment,darkColor,smoothstep(.67,.86,maze)*.68);
    #elif FISH_PATTERN == 12
      pigment=mix(paleColor,baseColor,smoothstep(-.3,.17,x+y*.29));
      pigment=mix(pigment,darkColor,smoothstep(.17,.37,y)*.68);
    #elif FISH_PATTERN == 15
      float band=max(stripe(x+y*.49,.66,.13),stripe(x+y*.62,-.14,.25));
      pigment=mix(mix(baseColor,paleColor,stripe(x+y*.2,-.49,.28)),darkColor,band);
    #elif FISH_PATTERN == 16 || FISH_PATTERN == 17
      float iridescence=.5+.5*cos(x*27.+y*17.+z*13.);
      pigment=mix(baseColor,paleColor,(.25+.30*iridescence)*(1.-smoothstep(-.32,.63,x)));
    #elif FISH_PATTERN == 18
      pigment=mix(mix(baseColor,paleColor,smoothstep(.39,.71,x)),darkColor,
        (1.-smoothstep(-.66,-.49,x)) * pow(.5+.5*cos(y*47.),3.));
    #else
      float islands=sin(x*8.+y*3.+z)*cos(x*4.-y*11.)+.32*sin(x*23.+y*19.);
      pigment=mix(baseColor,paleColor,smoothstep(-.2,.24,islands)*(FISH_PATTERN == 21 ? 1. : .62));
      pigment=mix(pigment,darkColor,pow(belly,5.)*.19);
    #endif
    if (region > 2.5) {
      if (region > 4.5) return vec3(.96,.99,1.);
      if (region > 3.5) return vec3(.008,.014,.021);
      return mix(vec3(.02,.029,.039),paleColor,.43);
    }
    if (region>.5) {
      float rays=pow(abs(sin(y*66.+2.*sin(x*13.))),6.);
      vec3 fin=mix(pigment,paleColor,.17)*(.67+.33*rays);
      #if FISH_PATTERN == 1
        if (region < 1.5) fin = paleColor*(.76+.19*rays);
      #elif FISH_PATTERN == 3
        fin = mix(darkColor,paleColor,pow(abs(sin(y*55.+x*23.)*cos(x*36.)),11.));
      #elif FISH_PATTERN == 0
        fin = mix(baseColor,darkColor,smoothstep(.04,.21,abs(y))*.65 + .09);
      #elif FISH_PATTERN == 16 || FISH_PATTERN == 17
        fin=mix(mix(baseColor,paleColor,.6),darkColor,pow(abs(sin(y*29.+x*7.)),8.)*.63);
      #endif
      pigment=fin;
    }
    float ripples=pow(.5+.5*sin(x*14.+y*11.+tankTime*.48+sin(z*10.+tankTime*.74)),12.);
    float gill=region<.5 ? stripe(x+.28*y+1.2*y*y,.53,.021) * (1.-smoothstep(.14,.32,abs(y))) : 0.;
    return pigment*skin*(1. + ripples*.36*tankLight)*(1.-gill*.32);
  }
`;

function fishMaterial(resources, species, uniforms) {
  const material=resources.keep(new THREE.MeshStandardMaterial({ color:'#fff', roughness:.43, metalness:.085, side:THREE.DoubleSide }));
  const [baseColor,paleColor,darkColor]=species.palette.map(color=>({ value:new THREE.Color(color) }));
  material.defines={ FISH_PATTERN:species.pattern };
  material.customProgramCacheKey=()=>`aquarium-fish-${species.pattern}-${species.speed}`;
  material.onBeforeCompile=(shader)=>{
    Object.assign(shader.uniforms,uniforms,{ baseColor,paleColor,darkColor });
    shader.vertexShader = /* glsl */`
      attribute float fishPart;
      varying float fishRegion;
      varying vec3 fishBody;
      uniform float tankTime;
      uniform float tankLight;
    ` + shader.vertexShader.replace('#include <begin_vertex>', /* glsl */`
      #include <begin_vertex>
      fishBody = position;
      fishRegion = fishPart;
      float swing = pow(1.-smoothstep(-1.13,.52,position.x),1.8);
      float frequency=${species.speed.toFixed(3)}*(3.9+tankLight*2.2);
      transformed.z += swing*(.14+tankLight*.085)*sin(tankTime*frequency - position.x*5.7 + modelMatrix[3].x*.67);
      if (fishPart>1.5 && fishPart<2.5) transformed.y -= .046*sin(tankTime*frequency + position.x*3.)*abs(position.z)*3.;
    `);
    shader.fragmentShader = pigmentShader + shader.fragmentShader.replace('#include <color_fragment>', /* glsl */`
      #include <color_fragment>
      diffuseColor.rgb *= paintFish(fishBody.x,fishBody.y,fishBody.z,fishRegion);
    `).replace('#include <roughnessmap_fragment>', /* glsl */`
      #include <roughnessmap_fragment>
      float scaleFlash=abs(sin(fishBody.x*77. + sin(fishBody.y*56.)*.61));
      float facing=abs(dot(normalize(vNormal), normalize(vViewPosition)));
      roughnessFactor=fishRegion > 2.5 ? .19 : mix(.23,.54,facing)+scaleFlash*.047;
    `);
  };
  return material;
}

export function makeFish(scene, resources, uniforms, settings, random, width, landmarks, food,
  visibleWidth = (z) => width*(1-z/17.5)) {
  const fish=[];
  const foreground=landmarks.filter(({plane})=>plane==='front');
  for (const [id,species] of Object.entries(FISH)) {
    const count=settings.stock[id];
    if (!count) continue;
    const geometry=resources.keep(fishGeometry(species,settings.quality!=='eco'));
    const material=fishMaterial(resources,species,uniforms);
    const schoolPhase=(settings.seed % 15)*.049 + (id==='sardine' ? .22 : -.53);
    const schoolSize=Math.ceil(count/(count>=10 ? 3 : count>=7 ? 2 : 1));
    for (let i=0; i<count; i++) {
      const size=species.size*(.78+random()*.42);
      const mesh=placeMesh(scene,geometry,material,0,0,0,size);
      const school=species.route==='school';
      const bank=(i===0 && count>=3 && foreground.length && foreground[species.pattern%foreground.length])
        || landmarks[(i*3+species.pattern*2)%landmarks.length];
      const track=Math.floor(i/schoolSize);
      const phase = school ? schoolPhase+track*.88 : i/count*Math.PI*2 + (i===0 && species.route==='roam' ? .08 : .52)+random()*.44;
      fish.push({ mesh, species, index:i, phase, track, slot:i%schoolSize,
        drag:school ? .982+random()*.040 : .82+random()*.36, yaw:0, running:false,
        homeX:bank.x + (random()-.5)*1.55, homeZ:bank.z + bank.size*.66+random()*1.65,
        height:1.4+random()*3.64, timer:0, seed:random()*6.28,
        seek:random()*.24, pause:0, bite:0, range:7.0+width*.17+random()*6.4, piece:null });
    }
  }
  const target=new THREE.Vector3();
  const towards=new THREE.Vector3();
  const mouth=new THREE.Vector3();
  return (delta,day) => {
    const feeding = food.active();
    for (const individual of fish) {
      const { mesh, species, index, phase, track, slot, seed, height, homeX, homeZ } = individual;
      individual.timer += delta*species.speed*(.35+day*.65)*individual.drag;
      const t=individual.timer;
      const school=species.route==='school';
      const orbit=phase+t*(school ? .23 : .30);
      if (school) {
        const turn=orbit-slot*.044;
        const row=slot%3-1, stagger=Math.floor(slot/3);
        const z=-6.0+Math.cos(turn+.35)*8.8-track*3.7+stagger*.57+.42*Math.sin(seed+t*.62);
        target.set(Math.sin(turn)*visibleWidth(z)*.91+row*.62,
          3.58+height*.12-track*.38+.95*Math.sin(turn*1.7+phase)+row*.30+.22*Math.sin(seed+t*.73),z);
      } else if (species.route==='reef') {
        const daylight=.45+day*.55;
        const z=homeZ+Math.cos(orbit)*2.32*daylight+(1-day)*-.64;
        const x=THREE.MathUtils.clamp(homeX+Math.sin(orbit)*2.94*daylight,-visibleWidth(z)*1.04,visibleWidth(z)*1.04);
        target.set(x,1.22+height*.46+Math.sin(t*.63+seed)*.86*daylight,z);
      } else {
        const bottom=species.route==='bottom';
        const lane=[3.15,-6.3,-13.8,-2.6][index%4];
        const z=lane+Math.cos(orbit)*(index%4===0 ? 4.6 : 6.6);
        const spread=bottom ? .83 : .94;
        target.set(Math.sin(orbit)*visibleWidth(z)*spread,height+.90*Math.sin(t*.31+phase),z);
        if (bottom) target.y=floorAt(target.x,target.z)+.68+.092*Math.sin(t*2+seed);
      }
      individual.pause=Math.max(0,individual.pause-delta);
      individual.bite=Math.max(0,individual.bite-delta);
      individual.seek-=delta;
      if (!feeding || individual.piece?.eaten || individual.piece?.age > 21) individual.piece=null;
      if (feeding && individual.running && individual.seek <= 0 && !individual.pause) {
        individual.seek=.13+individual.drag*.12;
        individual.piece=food.find(mesh.position,species.route==='bottom' ? 'bed' : 'swimmer',
          individual.range*(.74+day*.26),index+species.pattern);
      }
      const piece=individual.piece;
      if (piece) target.set(piece.x,piece.y+(species.route==='bottom' ? .24 : 0),piece.z);
      if (target.y < 3.7) for (const bank of landmarks) {
        const dx=(target.x-bank.x)/(bank.size*1.5), dz=(target.z-bank.z)/(bank.size*1.11);
        const clearance=1-dx*dx-dz*dz;
        if (clearance>0) target.y=Math.max(target.y,floorAt(bank.x,bank.z)+bank.size*.98*Math.sqrt(clearance)+.42);
      }
      target.y=THREE.MathUtils.clamp(target.y,.28,piece ? 7.80 : 6.35);
      towards.subVectors(target,mesh.position);
      const distance=Math.hypot(towards.x,towards.z);
      if (!individual.running) {
        individual.yaw=-Math.atan2(Math.sin(orbit) * -.61, Math.cos(orbit));
        mesh.position.copy(target);
        individual.running=true;
      } else if (delta>0) {
        if (distance > .006) {
          const bearing=-Math.atan2(towards.z,towards.x);
          const turn=Math.atan2(Math.sin(bearing-individual.yaw),Math.cos(bearing-individual.yaw));
          individual.yaw += turn*(1-Math.exp(-delta*(piece ? 6.1 : 4.1)));
        }
        const speed=piece ? Math.min(3.05, (.95+species.speed*1.46)*individual.drag) : 1.55;
        mesh.position.lerp(target,1-Math.exp(-delta*speed));
        mesh.rotation.z=THREE.MathUtils.clamp(towards.y*.36,-.46,.46);
        if (piece) {
          const nose=mesh.scale.x*.73;
          mouth.set(mesh.position.x+Math.cos(individual.yaw)*nose,mesh.position.y-.09,mesh.position.z-Math.sin(individual.yaw)*nose);
          if (food.consume(piece,mouth,.36+mesh.scale.x*.17) || food.consume(piece,mesh.position,.29)) {
            individual.bite=.36;
            individual.pause=.24+individual.drag*.26;
            individual.piece=null;
          }
        }
      }
      mesh.rotation.y=individual.yaw;
      mesh.rotation.x=.11*Math.sin(t*1.5+seed);
      if (individual.bite) mesh.rotation.z += Math.sin(individual.bite*24.)*.24*individual.bite/.36;
    }
  };
}
