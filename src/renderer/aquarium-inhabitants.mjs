import * as THREE from '../../node_modules/three/build/three.module.js';
import { floorAt } from './aquarium-habitat.mjs';
import { placeInstances, placeMesh, waterLit } from './aquarium-materials.mjs';
import { makeMollusc } from './aquarium-molluscs.mjs';
import { aquariumInvertebrateMotion } from './aquarium-invertebrate-motion.mjs';

const CRUSTACEANS = {
  cleaner: { body:'#dd704e', edge:'#ffeae5', shrimp:true },
  cherry: { body:'#b13b3c', edge:'#eba587', shrimp:true },
  blueShrimp: { body:'#3879a6', edge:'#80bdc8', shrimp:true },
  pistol: { body:'#b77953', edge:'#ead2ab', shrimp:true, claws:true },
  hermit: { body:'#bd6a47', edge:'#b49864', claws:true },
  kelpCrab: { body:'#887546', edge:'#b49864', claws:true },
  porcelain: { body:'#b9a491', edge:'#ead4ac', claws:true },
  emerald: { body:'#567a51', edge:'#9ea479', claws:true },
  lobster: { body:'#815e7b', edge:'#dbaf8a', shrimp:true, claws:true, large:true },
  crayfish: { body:'#2e6299', edge:'#6799b8', shrimp:true, claws:true, large:true },
  pomPom: { body:'#b96e52', edge:'#e9af81', claws:true },
};
const BOTTOM_DWELLERS = ['star','urchin','nerite','turbo','conch','cowrie','nudibranch','clam','scallop',
  'octopus','cuttlefish','cucumber','featherStar','mussel','oyster'];
const NIGHT_COLORS = { star:'#63e1e0', cleaner:'#b6f0ff', cherry:'#ff9478', blueShrimp:'#83c8ff' };
const UP = new THREE.Vector3(0,1,0);
const curve = (points) => new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)));

function line(parent, resources, coordinates, color, opacity = 1) {
  const geometry = resources.keep(new THREE.BufferGeometry().setFromPoints(coordinates.map((v) => new THREE.Vector3(...v))));
  const material = resources.keep(new THREE.LineBasicMaterial({ color, opacity, transparent: opacity < 1, depthWrite: opacity === 1 }));
  const object = new THREE.Line(geometry,material);
  parent.add(object);
  return object;
}

function shell(resources, uniforms, color, markings) {
  const material = waterLit(resources,uniforms,{ color, roughness:.48 }, { grain:'organic' });
  const underWater = material.onBeforeCompile;
  material.customProgramCacheKey=()=>`aquarium-shell-${markings}`;
  material.onBeforeCompile=(shader)=>{
    underWater(shader);
    shader.vertexShader='varying vec3 shellPoint;\n'+shader.vertexShader.replace('#include <begin_vertex>',
      '#include <begin_vertex>\n shellPoint = position;');
    shader.fragmentShader='varying vec3 shellPoint;\n'+shader.fragmentShader.replace('#include <color_fragment>', /* glsl */`
      #include <color_fragment>
      vec3 p=shellPoint;
      float a=atan(p.z,p.x);
      float spiral=a*7.0+length(p.xz)*7.0+p.y*6.4;
      float striae=sin(spiral+sin(a*12.+p.y*5.)*.45);
      float ridges=smoothstep(.18,.57,striae)* ${markings.toFixed(3)};
      diffuseColor.rgb *= 1.04 - ridges + sin(spiral*2.3)*.10;
    `);
  };
  return material;
}

function smallParts(resources, uniforms, random) {
  const styles=new Map();
  const hull=resources.keep(new THREE.SphereGeometry(1,17,12));
  const pebble=resources.keep(new THREE.IcosahedronGeometry(1,2));
  const limb=resources.keep(new THREE.CylinderGeometry(.77,1,1,6));
  const tip=resources.keep(new THREE.ConeGeometry(1,1,5));
  const thinTail=resources.keep(new THREE.TubeGeometry(curve([[.17,.025,0],[-.16,0,0],[-.43,-.06,.04],[-.56,-.12,.05]]),12,.044,7));
  const stars=new THREE.Shape();
  for (let i=0; i<45; i++) {
    const angle=i/45*Math.PI*2;
    const radius=.21+.32*Math.pow(.5+.5*Math.cos(angle*5),3.1);
    stars[i===0?'moveTo':'lineTo'](Math.cos(angle)*radius,Math.sin(angle)*radius);
  }
  stars.closePath();
  const starGeometry=resources.keep(new THREE.ExtrudeGeometry(stars,{ depth:.057, bevelEnabled:true,
    bevelSize:.033, bevelThickness:.037, bevelSegments:3, steps:1 }));
  starGeometry.rotateX(-Math.PI/2);
  function pigment(color, options = {}) {
    const key=options.emissive ? `${color}/${options.emissive}` : color;
    if (!styles.has(key)) styles.set(key,waterLit(resources,uniforms,{ color,roughness:.64,...options },
      { grain:'organic',nightGlow:Boolean(options.emissive) }));
    return styles.get(key);
  }
  const eyes=pigment('#141d21',{ roughness:.22 });
  const sandShadow=resources.keep(new THREE.MeshBasicMaterial({ color:'#202e32', opacity:.35, transparent:true, depthWrite:false }));
  const shadowDisc=resources.keep(new THREE.CircleGeometry(1,18).rotateX(-Math.PI/2));
  return { hull, pebble, limb, tip, thinTail, starGeometry, pigment, eyes, random, shadowDisc, sandShadow };
}

function bottomAnimal(parent, parts, resources, uniforms, id) {
  const { hull, pebble, tip, pigment, eyes, starGeometry, random } = parts;
  if (id==='star') {
    const red=random()<.5;
    const back=pigment(red ? '#c77942' : '#bf5748');
    placeMesh(parent,starGeometry,back,0,.02,0);
    const markings=[];
    for (let i=0;i<5;i++) {
      const angle=i/5*Math.PI*2;
      for (let j=1;j<10;j++) {
        const d=.046*j;
        const s=.018 + .010*(1-d) + .007*random();
        markings.push({position:[Math.cos(angle)*d,.111+random()*.005,-Math.sin(angle)*d],scale:[s,s*.60,s],
          color:j%2 ? '#e7a572' : '#e3b374' });
      }
    }
    placeInstances(parent,pebble,pigment('#ffffff',{emissive:NIGHT_COLORS.star,emissiveIntensity:.92}),markings);
    return (t,_day,feeding) => { parent.rotation.x=.025*Math.sin(t*.8)+(feeding ? .045 : 0); };
  }
  if (id==='urchin') {
    placeMesh(parent,hull,pigment('#4e304b'),0,.19,0,.22,.18,.22);
    const spines=[];
    for (let i=0;i<117;i++) {
      const h=.28+.71*i/116, phi=i*2.39996;
      const horizontal=Math.sqrt(1-h*h);
      const direction=new THREE.Vector3(Math.cos(phi)*horizontal,h-.33,Math.sin(phi)*horizontal).normalize();
      const length=.12+random()*.20, needle=.010+random()*.010;
      const end=direction.clone().multiplyScalar(.17+length*.52);
      spines.push({position:[end.x,.19+end.y,end.z],scale:[needle,length,needle],
        quaternion:new THREE.Quaternion().setFromUnitVectors(UP,direction),color:i%4===0?'#8d596e':'#534656'});
    }
    placeInstances(parent,tip,pigment('#ffffff'),spines);
    return (t) => { parent.rotation.z=.027*Math.sin(t*.47); };
  }
  const body=placeMesh(parent,hull,pigment('#878879'),.085,.111,0,.31,.081,.128);
  const carapace=placeMesh(parent,hull,shell(resources,uniforms,'#b9985e',.77),-.039,.246,0,.27,.21,.21);
  carapace.rotation.z=-.25;
  const feelers=[-1,1].map((side)=>{
    const group=new THREE.Group();
    group.position.set(.272,.176,.065*side);
    parent.add(group);
    line(group,resources,[[0,0,0],[.11,.068,.023*side],[.142,.122,.061*side]],'#c5aa85');
    placeMesh(group,hull,eyes,.13,.11,.055*side,.022);
    return group;
  });
  return (t,_day,biting,mode,speed=0) => {
    body.scale.x=.305+(.012+.034*speed)*Math.sin(t*2.6)+(biting?.028:0);
    const inspecting=mode==='inspect';
    for (const [i,antenna] of feelers.entries()) {
      antenna.rotation.z=.19*Math.sin(t*1.54+i)+(inspecting?.20:0);
      const reach=inspecting ? 1.07+.1*Math.sin(t*1.9+i) : mode==='rest' ? .62 : .93;
      antenna.scale.setScalar(antenna.scale.x+(reach-antenna.scale.x)*.14);
    }
  };
}

function crustacean(parent, parts, resources, uniforms, id) {
  const { hull, limb, thinTail, pigment, eyes } = parts;
  const { body:bodyColor, edge:edgeColor, shrimp, claws, large } = CRUSTACEANS[id];
  const hermit=id==='hermit';
  const back=pigment(bodyColor);
  const edge=NIGHT_COLORS[id] ? pigment(edgeColor,{emissive:NIGHT_COLORS[id],emissiveIntensity:.49}) : pigment(edgeColor);
  const scale=shrimp?.78:1;
  const body=placeMesh(parent,hull,back,0,.228,0,large?.36:shrimp?.255:.31,shrimp?.122:.146,large?.20:shrimp?.135:.244);
  let tailFan;
  if (shrimp) {
    placeMesh(parent,thinTail,back,0,.172,0);
    for (let i=0;i<5;i++) {
      const shrink=.105-i*.013;
      placeMesh(parent,hull,back,-.19-i*.066,.20-i*.024,0,shrink,.091-i*.009,.114-i*.013);
      const joint=placeMesh(parent,hull,edge,-.226-i*.064,.20-i*.024,0,.020,.078-i*.008,.103-i*.012);
      joint.rotation.z=.19;
    }
    const fan=placeMesh(parent,hull,edge,-.57,.104,0,.131,.022,.110);
    tailFan=fan;
    fan.rotation.z=.39;
    if (id==='cleaner') placeMesh(parent,hull,edge,-.027,.324,0,.218,.017,.049);
    if (large) for (const side of [-1,1]) {
      const blade=placeMesh(parent,hull,back,-.54,.098,side*.108,.15,.025,.094);
      blade.rotation.y=side*.28;
    }
  } else if (hermit) {
    const shellMesh=placeMesh(parent,hull,shell(resources,uniforms,'#b29467',.44),-.212,.358,-.045,.314,.307,.253);
    shellMesh.rotation.z=.43;
    placeMesh(parent,hull,shellMesh.material,-.35,.48,-.07,.167,.137,.144);
  } else if (id==='porcelain'||id==='pomPom'||id==='emerald') {
    const tiles=[];
    for(let i=0;i<28;i++) {
      const angle=i*2.399963, r=parts.random()*.93;
      const ratio=.016+parts.random()*.027;
      tiles.push({position:[Math.cos(angle)*r*.283,.27+Math.sqrt(1-r*r)*.099,Math.sin(angle)*r*.21],
        scale:[ratio,.018,ratio],color:id==='porcelain'?(i%3===0?'#936b5a':'#ded3b1'):edgeColor});
    }
    placeInstances(parent,hull,pigment('#fff'),tiles);
  }
  for (const side of [-1,1]) {
    placeMesh(parent,hull,eyes,shrimp?.20:.235,.30,side*(shrimp?.105:.155),shrimp?.037:.048);
  }
  const whiskers=[];
  if (shrimp) for (const side of [-1,1]) {
    const whisker = new THREE.Group();
    whisker.position.set(.203,.282,side*.077);
    parent.add(whisker);
    line(whisker,resources,curve([[0,0,0],[.26,.12,side*.13],[.42,.28,side*.26],[.67,.38,side*.43]]).getPoints(13).map((q)=>q.toArray()),
      id==='cleaner'?'#ffefe2':'#deaa89',.84);
    line(whisker,resources,[[0,0,0],[.25,.03,side*.098],[.54,.14,side*.22]],'#e6bd87',.75);
    whiskers.push(whisker);
  }
  const clawGroups=[];
  if (claws) for (const side of [-1,1]) {
    const arm=new THREE.Group();
    arm.position.set(.265,.183,.17*side);
    if (id==='pistol') arm.scale.setScalar(side>0 ? 1.33 : .51);
    if (large) arm.scale.setScalar(1.38);
    parent.add(arm);
    placeMesh(arm,hull,back,.141,.016,.05*side,.174,.084,.119);
    const pincer=placeMesh(arm,hull,edge,.233,.033,.072*side,.113,.047,.042);
    pincer.rotation.y=side*.38;
    const other=placeMesh(arm,hull,back,.227,.014,.003*side,.121,.054,.048);
    other.rotation.y=-side*.25;
    if (id==='pomPom'||id==='porcelain') {
      const frond=[];
      const pompoms=id==='pomPom';
      for (let i=0;i<19;i++) {
        const a=i*2.399963, r=.031+parts.random()*.063;
        frond.push({position:[.40+(pompoms?.035:.087)*Math.cos(a),.058+r*Math.sin(a),.06*side+r*Math.cos(a)],
          scale:[pompoms?.054:.082,.011,.011],rotation:[0,a,.69*Math.sin(a)],color:i%2?'#d9ac86':'#ebbaae'});
      }
      placeInstances(arm,hull,pigment('#fff'),frond);
    }
    clawGroups.push(arm);
  }
  const legCount=shrimp?5:4;
  const limbs=new THREE.InstancedMesh(limb,back,legCount*4);
  limbs.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  limbs.frustumCulled=false;
  parent.add(limbs);
  const knee=new THREE.Vector3(), joint=new THREE.Vector3(), toe=new THREE.Vector3(), stretch=new THREE.Vector3();
  const dummy=new THREE.Object3D();
  function write(index,origin,end,width) {
    stretch.subVectors(end,origin);
    dummy.position.copy(origin).lerp(end,.5);
    dummy.scale.set(width,stretch.length(),width);
    dummy.quaternion.setFromUnitVectors(UP,stretch.normalize());
    dummy.updateMatrix();
    limbs.setMatrixAt(index,dummy.matrix);
  }
  return (t,day,biting,mode,speed=0) => {
    const retreat=mode==='retreat' || mode==='shelter';
    const display=mode==='display';
    const tending=mode==='clean' || mode==='approach' || mode==='inspect';
    const stride=.14+speed*.86;
    body.rotation.y=.055*Math.sin(t*1.8);
    body.rotation.z=retreat ? .12+.13*Math.sin(t*6.2) : .025*Math.sin(t*2.1);
    if (tailFan) tailFan.rotation.z=.39+(retreat ? .53*Math.sin(t*11) : .10*speed*Math.sin(t*5.5));
    const gait=t*(3.1+(1-day)*2.0)+(biting ? .67:0);
    for (let i=0;i<legCount*2;i++) {
      const leg=i%legCount, side=i<legCount ? -1 : 1;
      const step=gait+leg*1.24+(side===1 ? Math.PI : 0);
      joint.set(.145-leg*.098,.165,side*(shrimp?.093:.152));
      knee.set(joint.x-.058+Math.sin(step)*.09*stride,.182+Math.cos(step)*.034*stride,side*(.33+(.046-leg*.012))*scale);
      toe.set(knee.x-.125+Math.sin(step)*.125*stride,.033+Math.max(0,Math.cos(step))*.093*stride,side*(.325+(.12-leg*.025))*scale);
      write(i*2,joint,knee,(shrimp?.018:.032)*(1-leg*.075));
      write(i*2+1,knee,toe,(shrimp?.013:.025)*(1-leg*.085));
    }
    limbs.instanceMatrix.needsUpdate=true;
    for (const [i,group] of clawGroups.entries()) {
      group.rotation.y=.25*Math.sin(t*1.75+i)+(display ? .28*(i ? -1 : 1) : 0);
      group.rotation.z=display ? .83+.19*Math.sin(t*5+i) : biting ? .25+.27*Math.sin(t*8.7+i)
        : retreat ? .31+.16*Math.sin(t*5+i) : .08*Math.sin(t*2.9+i);
    }
    for (const [i,group] of whiskers.entries()) {
      group.rotation.y=(tending ? .38 : .23)*Math.sin(t*2.13+i*2.5);
      group.rotation.z=.16*Math.cos(t*1.7+i)+(tending ? .24 : retreat ? -.15 : 0);
    }
  };
}

function makeJellies(scene, resources, uniforms, random, count, width, movement) {
  if (!count) return;
  const bell=resources.keep(new THREE.SphereGeometry(1,26,16,0,Math.PI*2,0,Math.PI*.57));
  const ring=resources.keep(new THREE.TorusGeometry(1,.014,6,40).rotateX(Math.PI/2));
  const blob=resources.keep(new THREE.TorusGeometry(.19,.035,8,24,Math.PI*1.65).rotateX(Math.PI/2));
  const membrane=resources.keep(new THREE.MeshPhysicalMaterial({ color:'#a4cdd9', emissive:'#557eab', emissiveIntensity:.18,
    roughness:.42, metalness:0, clearcoat:.6, transparent:true, opacity:.56, side:THREE.DoubleSide, depthWrite:false }));
  const rim=resources.keep(new THREE.MeshBasicMaterial({ color:'#d1f6ff', transparent:true, opacity:.49, depthWrite:false }));
  const organs=resources.keep(new THREE.MeshBasicMaterial({ color:'#ccaad9', transparent:true, opacity:.52, depthWrite:false }));
  for (let i=0;i<count;i++) {
    const object=new THREE.Group();
    const scale=.48+random()*.38;
    object.scale.setScalar(scale);
    scene.add(object);
    const dome=placeMesh(object,bell,membrane,0,.04,0,1,.43,1);
    dome.renderOrder=2;
    const edge=placeMesh(object,ring,rim,0,-.054,0);
    for (let j=0;j<4;j++) {
      const a=j*Math.PI*.5;
      const mark=placeMesh(object,blob,organs,Math.cos(a)*.31,.199,Math.sin(a)*.31,.87);
      mark.rotation.y=-a;
    }
    const tentacles=[];
    for (let j=0;j<17;j++) {
      const a=j/17*Math.PI*2, radius=.2+random()*.76, length=.37+random()*.87;
      const pendulum=new THREE.Group();
      pendulum.position.set(Math.cos(a)*radius,-.047,Math.sin(a)*radius);
      object.add(pendulum);
      const trace=Array.from({length:17},(_,k)=>{
        const t=k/16;
        return [t*.08*Math.sin(t*17+a),-t*length,t*.17*Math.sin(t*8.+a)];
      });
      if (j<4) {
        const appendage=resources.keep(new THREE.TubeGeometry(curve(trace),21,.026,5));
        placeMesh(pendulum,appendage,membrane,0,0,0);
      } else line(pendulum,resources,trace,'#c3e8f2',.41);
      tentacles.push(pendulum);
    }
    const offset=random()*Math.PI*2, x=(i/Math.max(1,count-1)*1.12-.56)*width;
    const pose=(t,_day,feeding,_mode,speed)=>{
      const pulse=.5+.5*Math.sin(t*(1.95+speed*.53)+offset);
      object.rotation.x=.17*Math.sin(t*.63+offset);
      dome.scale.set(1.02-.18*pulse,.38+.24*pulse,1.02-.18*pulse);
      edge.scale.setScalar(1.010-.174*pulse);
      edge.position.y=-.04-.046*pulse;
      for (const [j,arm] of tentacles.entries()) {
        arm.rotation.z=.12*Math.sin(t*1.36+j*.33+offset)+.23*pulse*Math.cos(j*2.13)+(feeding?.12:0);
        arm.rotation.x= .12*Math.cos(t*1.52+j*.39+offset);
      }
    };
    movement.add('jelly',object,pose,null,x,-3.22-i%4*1.2);
  }
  return () => { membrane.emissiveIntensity=.18+.64*(uniforms.tankNight?.value ?? 0); };
}

export function makeRays(scene, resources, uniforms, random, count) {
  if (!count) return [];
  const vertices=[], indices=[];
  const columns=30, rows=16;
  for (let i=0;i<=columns;i++) {
    const span=i/columns*2-1, tip=Math.abs(span);
    const reach=Math.pow(1-tip,.52);
    for (let j=0;j<=rows;j++) {
      const u=j/rows;
      const sweep=-.47*tip-.13*Math.sin(tip*3);
      const x=sweep+(u*1.46-.64)*reach;
      vertices.push(x,.18*Math.sin(u*Math.PI)*(1-tip)**2-.11*tip,span*1.46);
      if (i && j) {
        const k=vertices.length/3-1;
        indices.push(k-rows-2,k-1,k-rows-1,k-1,k,k-rows-1);
      }
    }
  }
  const ray=resources.keep(new THREE.BufferGeometry());
  ray.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));
  ray.setIndex(indices);
  ray.computeVertexNormals();
  const tail=resources.keep(new THREE.TubeGeometry(curve([[0,-.03,0],[-.33,0,.02],[-.64,-.02,.089],[-.96,.038,.22],[-1.18,.12,.33]]),20,.026,7));
  const dotBody=resources.keep(new THREE.SphereGeometry(1,15,9));
  const material=resources.keep(new THREE.MeshStandardMaterial({ color:'#b18654', roughness:.72, side:THREE.DoubleSide }));
  material.onBeforeCompile=(shader)=>{
    Object.assign(shader.uniforms,uniforms);
    shader.vertexShader='varying vec3 rayPoint; uniform float tankTime;\n'+shader.vertexShader.replace('#include <begin_vertex>', /* glsl */`
      #include <begin_vertex>
      rayPoint=position;
      transformed.y += pow(abs(position.z)/1.46,1.16)*.40*sin(tankTime*3.2 - position.x*2.1 - abs(position.z)*1.2 + modelMatrix[3].z);
    `);
    shader.fragmentShader='varying vec3 rayPoint;\n'+shader.fragmentShader.replace('#include <color_fragment>', /* glsl */`
      #include <color_fragment>
      vec2 samplePos = rayPoint.xz * 8.2;
      samplePos.x += mod(floor(samplePos.y),2.)*.5;
      vec2 sampleCell=floor(samplePos);
      vec2 j = vec2(cos(sampleCell.x*4.31+sampleCell.y*7.1),sin(sampleCell.x*3.53-sampleCell.y*5.6))*.23;
      float d=length(fract(samplePos)-.5+j);
      float dotBody=1.-smoothstep(.15,.24,d);
      diffuseColor.rgb *= .82 + .21*sin(rayPoint.z*9.+rayPoint.x*4.);
      diffuseColor.rgb = mix(diffuseColor.rgb,vec3(.035,.27,.52),dotBody*.95);
    `);
  };
  const bodyMat=waterLit(resources,uniforms,{color:'#937452',roughness:.72},{grain:'organic'});
  const eyeMat=resources.keep(new THREE.MeshStandardMaterial({color:'#262a28',roughness:.36}));
  return Array.from({length:count},(_,i)=>{
    const node=new THREE.Group();
    node.scale.setScalar(.78+random()*.28);
    scene.add(node);
    placeMesh(node,ray,material,0,0,0);
    placeMesh(node,dotBody,bodyMat,.18,0,0,.61,.141,.36);
    for (const side of [-1,1]) placeMesh(node,dotBody,eyeMat,.36,.101,side*.16,.073,.064,.078);
    const whip=placeMesh(node,tail,bodyMat,-.54,-.025,0);
    return {node,whip,phase:i*1.9+random()};
  });
}

function nightHalos(resources, uniforms) {
  const halos=[], materials=new Map();
  const geometry=resources.keep(new THREE.PlaneGeometry(1,1));
  return {
    add(node,id) {
      const color=NIGHT_COLORS[id];
      if (!color) return;
      if (!materials.has(color)) materials.set(color,resources.keep(new THREE.ShaderMaterial({
        uniforms:{ tint:{value:new THREE.Color(color)}, tankNight:uniforms.tankNight, tankTime:uniforms.tankTime },
        transparent:true, depthWrite:false, blending:THREE.AdditiveBlending,
        vertexShader:/* glsl */`
          varying vec2 haloUv;
          varying float glowDistance;
          varying float phase;
          void main() {
            vec4 point=modelViewMatrix*vec4(0.,0.,0.,1.);
            haloUv=uv*2.-1.;
            glowDistance=-point.z;
            phase=modelMatrix[3].x*.81+modelMatrix[3].z*.52;
            point.xy+=position.xy*vec2(length(modelMatrix[0].xyz),length(modelMatrix[1].xyz));
            gl_Position=projectionMatrix*point;
          }
        `,
        fragmentShader:/* glsl */`
          uniform vec3 tint;
          uniform float tankNight;
          uniform float tankTime;
          varying vec2 haloUv;
          varying float glowDistance;
          varying float phase;
          void main() {
            float radius=dot(haloUv,haloUv);
            float halo=exp(-radius*4.5)*(1.-smoothstep(.36,1.,radius));
            float pulse=.86+.14*sin(tankTime*1.21+phase);
            gl_FragColor=vec4(tint,halo*tankNight*pulse*.21*exp(-glowDistance*.018));
            #include <colorspace_fragment>
          }
        `,
      })));
      const star=id==='star';
      const halo=placeMesh(node,geometry,materials.get(color),star ? 0 : -.23,star ? .13 : .24,0,star ? 1.72 : 1.42,star ? .91 : .77,1);
      halo.visible=false;
      halos.push(halo);
    },
    refresh() {
      const visible=(uniforms.tankNight?.value ?? 0)>.01;
      for (const halo of halos) halo.visible=visible;
    },
  };
}

export function makeInhabitants(scene, resources, uniforms, settings, random, width, rocks, food, options) {
  const parts=smallParts(resources,uniforms,random);
  const movement=aquariumInvertebrateMotion(random,width,rocks,food,options);
  const glow=nightHalos(resources,uniforms);
  const anchored=[];
  let population=0;
  for (const [kind,list] of [['crustacean',Object.keys(CRUSTACEANS)],['bottom',BOTTOM_DWELLERS]]) for (const id of list) {
    for (let i=0;i<settings.stock[id];i++) {
      const node=new THREE.Group();
      const scale=(CRUSTACEANS[id]?.large || id==='octopus' ? 1.12 : kind==='crustacean'?.75: .79)+random()*.375;
      node.scale.setScalar(scale);
      scene.add(node);
      const pose=kind==='crustacean' ? crustacean(node,parts,resources,uniforms,id)
        : ['star','urchin','nerite'].includes(id) ? bottomAnimal(node,parts,resources,uniforms,id)
          : makeMollusc(node,parts,resources,uniforms,id);
      glow.add(node,id);
      const shadow=placeMesh(node,parts.shadowDisc,parts.sandShadow,0,-.016,0,id==='star'?.35:.28,1,.22);
      const bank=rocks[(i*2+population)%rocks.length] ?? {x:0,z:-4,size:0};
      const sign=population++%2 ? 1 : -1;
      const x=i===0 ? width*sign*(.12+random()*.40) : bank.x+.42*sign;
      const z=i===0 ? 2.65-random()*1.8 : bank.z+bank.size*1.31+.54;
      const phase=random()*Math.PI*2;
      if (movement.add(id,node,pose,shadow,x,z)) continue;
      node.position.set(x,floorAt(x,z)+.034,z);
      node.rotation.y=phase;
      anchored.push({node,pose,phase,seek:random()*.34,bite:0,piece:null});
    }
  }

  const lightJellies=makeJellies(scene,resources,uniforms,random,settings.stock.jelly,width,movement);
  return (time,delta,day) => {
    glow.refresh();
    lightJellies?.();
    const feeding=food.active();
    for (const animal of anchored) {
      const {node,pose,phase}=animal;
      animal.seek-=delta;
      animal.bite=Math.max(0,animal.bite-delta);
      if (!feeding || animal.piece?.eaten || animal.piece?.age>21) animal.piece=null;
      if (feeding && animal.seek<=0 && !animal.bite) {
        animal.seek=.32;
        animal.piece=food.find(node.position,'sifter',.88,Math.floor(phase*4));
      }
      if (animal.piece && food.consume(animal.piece,node.position,.68)) {
        animal.bite=.69;
        animal.piece=null;
      }
      pose(time*.82+phase,day,Boolean(animal.bite || animal.piece));
    }
    movement.animate(delta,day,anchored);
  };
}
