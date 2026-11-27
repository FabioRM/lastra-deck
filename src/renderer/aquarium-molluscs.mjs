import * as THREE from '../../node_modules/three/build/three.module.js';
import { placeInstances, placeMesh, waterLit } from './aquarium-materials.mjs';

const UP = new THREE.Vector3(0,1,0);
const vector = (p) => new THREE.Vector3(...p);

function ridgedShell(resources, profile, ridges) {
  const shape = new THREE.LatheGeometry(profile.map(([x,y])=>new THREE.Vector2(x,y)),38);
  const vertex = shape.attributes.position;
  for (let i=0;i<vertex.count;i++) {
    const x=vertex.getX(i), y=vertex.getY(i), z=vertex.getZ(i);
    const spiral=Math.atan2(z,x)*ridges - y*3.1;
    const sculpt=1+.072*Math.sin(spiral)+.05*Math.sin(y*24.5+spiral*.71);
    vertex.setXYZ(i,x*sculpt,y,z*sculpt);
  }
  shape.computeVertexNormals();
  return resources.keep(shape);
}

function snail(node, parts, resources, uniforms, id) {
  const { hull, pigment, eyes, random } = parts;
  const body=placeMesh(node,hull,pigment('#827764'),.08,.087,0,.43,.105,.15);
  const whelk = id==='conch', cowrie = id==='cowrie';
  const color= cowrie ? '#c6ab84' : whelk ? '#b98964' : '#898577';
  const skin=waterLit(resources,uniforms,{color,roughness:cowrie?.29:.70},{grain:'organic'});
  const base=skin.onBeforeCompile;
  skin.customProgramCacheKey=()=>`aquarium-gastropod-${id}`;
  skin.onBeforeCompile=(shader)=>{
    base(shader);
    shader.vertexShader='varying vec3 shellLocal;\n'+shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\n shellLocal=position;');
    shader.fragmentShader='varying vec3 shellLocal;\n'+shader.fragmentShader.replace('#include <color_fragment>',/* glsl */`
      #include <color_fragment>
      float a=atan(shellLocal.z,shellLocal.x);
      float band=sin(a*10.+shellLocal.y*26.);
      float spots=sin(a*21.+shellLocal.y*4.)*cos(shellLocal.y*25.+a*4.);
      diffuseColor.rgb *= ${cowrie ? '1.1-.78*smoothstep(.48,.75,spots)' : '.91+.17*band+.13*spots'};
    `);
  };
  if (cowrie) {
    placeMesh(node,hull,skin,-.08,.212,0,.37,.207,.247);
    placeMesh(node,hull,pigment('#cbbc9c'),-.08,.091,0,.314,.041,.195);
  } else {
    const profile = whelk ? [[.01,0],[.30,.10],[.31,.21],[.23,.37],[.28,.50],[.17,.67],[.13,.77],[.09,.89],[0,1]]
      : [[.02,0],[.30,.08],[.33,.26],[.34,.36],[.28,.44],[.24,.51],[.23,.66],[.15,.72],[.13,.81],[.07,.87],[0,.9]];
    const top = placeMesh(node,ridgedShell(resources,profile,whelk?8:11),skin,-.13,.082,0,whelk?.74:.88,whelk?.69:.57,.69);
    top.rotation.z=whelk?.83:.29;
    if (whelk) placeMesh(node,hull,pigment('#da9d72'),.01,.17,.16,.217,.106,.08);
  }
  const eyesOn=[];
  for (const side of [-1,1]) {
    const antenna=new THREE.Group();
    antenna.position.set(.29,.114,side*.095);
    node.add(antenna);
    const stem=resources.keep(new THREE.CylinderGeometry(.010,.026,.19,7));
    const stalk=placeMesh(antenna,stem,pigment('#bba981'),.065,.071,side*.017);
    stalk.rotation.z=-.67;
    placeMesh(antenna,hull,eyes,.129,.144,side*.03,.021);
    eyesOn.push(antenna);
  }
  const phase=random()*6;
  return (time,_day,bite,mode,speed=0) => {
    body.scale.x=.41+(.015+.035*speed)*Math.sin(time*4.1+phase)+(bite?.034:0);
    const extension=mode==='inspect' ? 1.15 : mode==='rest' ? .62 : .96;
    eyesOn.forEach((antenna,index)=>{
      antenna.rotation.z=.17*Math.sin(time*2.+index)+(mode==='inspect' ? .16 : 0);
      antenna.scale.setScalar(antenna.scale.x+(extension-antenna.scale.x)*.14);
    });
  };
}

function makeValve(id) {
  const mussel=id==='mussel', oyster=id==='oyster';
  const points=[], indices=[];
  for (let j=0;j<=12;j++) for (let i=0;i<=34;i++) {
    const u=j/12, angle=(i/34-.5)*Math.PI*1.46;
    const rib=mussel ? .97+.032*Math.cos(i*.88) : oyster ? .81+.18*Math.cos(i*1.42) :
      .77+.23*Math.pow(.5+.5*Math.cos(i/34*Math.PI*29),.64);
    const h=Math.sin(Math.PI*u)*.22 + (oyster ? .079 : .028)*Math.cos(i*.8)*u;
    const taper=mussel ? .46+.38*Math.sin(u*1.56) : 1;
    points.push(Math.cos(angle*.70)*u-.13+(oyster ? .047*u*Math.sin(i*1.9) : 0),h*rib,
      Math.sin(angle)*u*(mussel ? .57 : .83)*taper*rib);
    if (i&&j) {
      const p=points.length/3-1;
      indices.push(p-36,p-35,p-1,p-1,p-35,p);
    }
  }
  const shell=new THREE.BufferGeometry();
  shell.setAttribute('position',new THREE.Float32BufferAttribute(points,3));
  shell.setIndex(indices);
  shell.computeVertexNormals();
  return shell;
}

function bivalve(node, parts, resources, uniforms, id) {
  const scallop=id==='scallop';
  const mussel=id==='mussel', oyster=id==='oyster';
  if (mussel || oyster) node.scale.multiplyScalar(mussel ? .60 : .72);
  const shell=resources.keep(makeValve(id));
  const shellColour=mussel ? '#424c60' : oyster ? '#9b8b75' : scallop ? '#b98765' : '#b2a186';
  const shellMat=waterLit(resources,uniforms,{color:shellColour,roughness:mussel?.53:.74,side:THREE.DoubleSide},{grain:'organic'});
  const mantleColour=mussel||oyster ? '#d9ae82' : scallop?'#e46135':'#436e95';
  const mantle=waterLit(resources,uniforms,{color:mantleColour,roughness:.56,emissive:scallop?'#bb512b':'#315a92',
    emissiveIntensity:.24},{grain:'organic'});
  const top=placeMesh(node,shell,shellMat,-.57,.22,0,.98,-1,1.11);
  placeMesh(node,shell,shellMat,-.57,.105,0,1.02,1,1.11);
  const lips=new THREE.Group();
  lips.position.set(-.48,.18,0);
  node.add(lips);
  const spots=[];
  for (let i=0;i<19;i++) {
    const a=(i/18-.5)*Math.PI*1.43, x=.74*Math.cos(a*.66), z=.57*Math.sin(a);
    spots.push({position:[x,.12+Math.cos(a)*.041,z*(mussel?.49:1)],scale:[.12,.081,.086],
      color:mussel||oyster ? (i%3===0?'#d9bd99':'#c49972') : scallop?(i%4===0?'#fbb268':'#e96b49'):(i%3===0?'#72bdd4':'#658dbe')});
    if (scallop && i%2===0) placeMesh(lips,parts.hull,parts.pigment('#4f6f82'),x+.066,.139,z,.021);
  }
  placeInstances(lips,parts.hull,mantle,spots);
  const valve=(mussel||oyster?.21:.46)+parts.random()*.14;
  return (time,_day,snack,mode) => {
    top.rotation.z=mode==='hop' ? .08 + valve*(.45+.53*Math.sin(time*11.5))
      : valve+Math.sin(time*1.15)*.08+(snack?.23:0);
    lips.scale.y=.89+.12*Math.sin(time*2.36);
  };
}

export function makeMusselBed(scene, resources, uniforms, random) {
  const shell=resources.keep(makeValve('mussel'));
  const material=waterLit(resources,uniforms,{color:'#fff',roughness:.61,side:THREE.DoubleSide},{grain:'organic'});
  const valves=[];
  for (let i=0;i<26;i++) {
    const a=i*2.399963, radius=Math.sqrt(i/26)*.94, size=.22+random()*.27;
    const color=['#353744','#465365','#645b63','#2c4351'][i%4];
    const position=[Math.cos(a)*radius,.035+random()*.08,Math.sin(a)*radius*.56];
    const rotation=[(random()-.5)*.31,random()*6.28,(random()-.5)*.41];
    valves.push({position,rotation,color,scale:[size,size,size]});
    valves.push({position:[position[0],position[1]+.022,position[2]],rotation:[rotation[0]+Math.PI,rotation[1],rotation[2]],
      color,scale:[size,size,size]});
  }
  placeInstances(scene,shell,material,valves);
}

function slug(node, parts, id) {
  const { hull,pigment,random }=parts;
  const cucumber=id==='cucumber';
  const body=placeMesh(node,hull,pigment(cucumber?'#918460':'#3e78a9'),0,.16,0,cucumber?.69:.49,.13,cucumber?.31:.22);
  const marks=[];
  const count=cucumber?73:35;
  for (let i=0;i<count;i++) {
    const x=(random()-.5)*(cucumber?1.22:.83), z=(random()-.5)*(cucumber?.48:.29);
    const h=(cucumber?.19:.21) + .056*Math.cos(x*3.8)+random()*.014;
    const s=.022+random()*.040;
    marks.push({position:[x,h,z],scale:[s,s*(cucumber?1.8:.78),s],color:cucumber?'#a69a77':i%4===0?'#426e99':'#d1a948'});
  }
  if (!cucumber) for (let i=0;i<24;i++) {
    const a=i/24*Math.PI*2;
    marks.push({position:[Math.cos(a)*.47,.133,Math.sin(a)*.204],scale:[.096,.039,.048],color:'#ead18a',rotation:[0,-a,0]});
  }
  placeInstances(node,hull,pigment('#fff'),marks);
  const fringe=new THREE.Group();
  fringe.position.set(cucumber ? .57 : -.25,.18,0);
  node.add(fringe);
  const arms=cucumber?8:7;
  for (let i=0;i<arms;i++) {
    const a=i/arms*Math.PI*2;
    const plume=placeMesh(fringe,hull,pigment(cucumber?'#8d8e73':'#e0b747'),Math.cos(a)*.069,.092,Math.sin(a)*.075,.023,.12,.023);
    plume.rotation.set(Math.sin(a)*.54,0,Math.cos(a)*.56);
  }
  if(!cucumber) for (const side of [-1,1]) {
    const horn=placeMesh(node,hull,pigment('#e3aa45'),.31,.235,side*.091,.027,.113,.029);
    horn.rotation.z=-.29;
  }
  return (time,_day,bite,mode,speed=.5)=>{
    body.scale.y=.131+(.010+.018*speed)*Math.sin(time*1.65);
    body.scale.x=(cucumber?.69:.49)*(1+.065*speed*Math.sin(time*2.4));
    fringe.scale.y=(mode==='inspect' || bite ? 1.27 : 1)+.21*Math.sin(time*2.7);
  };
}

function featherStar(node, parts) {
  const { hull,limb,pigment }=parts;
  const crown=new THREE.Group();
  crown.position.y=.18;
  node.add(crown);
  placeMesh(node,hull,pigment('#7b564e'),0,.11,0,.20,.13,.17);
  const feathers=[];
  const add=(a,b,r,color)=>{
    const delta=b.clone().sub(a);
    feathers.push({position:a.clone().lerp(b,.5).toArray(),scale:[r,delta.length(),r],
      quaternion:new THREE.Quaternion().setFromUnitVectors(UP,delta.normalize()),color});
  };
  for (let k=0;k<11;k++) {
    const a=k/11*Math.PI*2, dx=Math.cos(a), dz=Math.sin(a);
    const point=(t)=>vector([dx*t*.70,Math.sin(t*2.06)*.64,dz*t*.70]);
    for (let i=1;i<=12;i++) {
      const t=i/12, head=point(t);
      add(point((i-1)/12),head,.022*(1-t*.47),'#a66746');
      for (const sign of [-1,1]) {
        const r=(.07+.085*Math.sin(t*Math.PI))*sign;
        add(head,vector([head.x+r*dz,head.y+.08,head.z-r*dx]),.008,'#d6a15a');
      }
    }
  }
  placeInstances(crown,limb,pigment('#fff'),feathers);
  return (time,_day,feeding,mode,speed=0)=>{
    crown.rotation.y=.19*Math.sin(time*1.2);
    const height=mode==='retreat' || mode==='shelter' ? .52 : mode==='roam' ? .68+.11*speed : feeding ? 1.08 : .92;
    crown.scale.y+=(height+.10*Math.sin(time*1.63)-crown.scale.y)*.17;
  };
}

function cephalopod(node, parts, resources, uniforms, id) {
  const { hull,pigment,eyes,random }=parts;
  const octopus=id==='octopus';
  const mantle=waterLit(resources,uniforms,{color:octopus?'#ae6c62':'#bd9b71', roughness:.69},{grain:'organic'});
  const original=mantle.onBeforeCompile;
  mantle.customProgramCacheKey=()=>`aquarium-cephalopod-${id}`;
  mantle.onBeforeCompile=(shader)=>{
    original(shader);
    shader.vertexShader='varying vec3 skinLocal;\n'+shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\n skinLocal=position;');
    shader.fragmentShader='varying vec3 skinLocal;\n'+shader.fragmentShader.replace('#include <color_fragment>',/* glsl */`
      #include <color_fragment>
      float skinWave=sin(skinLocal.x*13.+sin(skinLocal.y*11.)*1.6 + tankTime*.48)*sin(skinLocal.z*14.-skinLocal.y*6.);
      diffuseColor.rgb *= .85 + .20*skinWave + .16*sin(skinLocal.x*31.+skinLocal.y*13.);
    `);
  };
  const head=placeMesh(node,hull,mantle,-.13,octopus?.47:.19,0,octopus?.48:.81,octopus?.40:.23,octopus?.41:.37);
  for (const side of [-1,1]) {
    const eye=placeMesh(node,hull,pigment('#dfb881'),.31,octopus?.56:.27,side*.244,.103,.087,.068);
    eye.rotation.x=side*.18;
    placeMesh(node,hull,eyes,.34,octopus?.565:.277,side*.293,.065,.027,.026);
  }
  const arms=[];
  for (let i=0;i<8;i++) {
    const arm=new THREE.Group();
    const angle=octopus ? i/8*Math.PI*2 : (i-3.5)*.18;
    arm.position.set(octopus?.04:.51,octopus?.20:.10,0);
    node.add(arm);
    const length=octopus ? .82+random()*.56 : .46+random()*.24;
    const path=new THREE.CatmullRomCurve3([[0,0,0],[length*.37,-.08,.02],[length*.74,-.10,.058],[length,.02,.13]].map(vector));
    const shape=new THREE.TubeGeometry(path,16,octopus?.102:.047,8), attr=shape.attributes.position;
    const center=new THREE.Vector3(), vertex=new THREE.Vector3();
    for (let j=0;j<attr.count;j++) {
      const t=Math.floor(j/9)/16;
      path.getPointAt(t,center);
      vertex.fromBufferAttribute(attr,j).lerp(center,t*.85);
      attr.setXYZ(j,vertex.x,vertex.y,vertex.z);
    }
    shape.computeVertexNormals();
    placeMesh(arm,resources.keep(shape),mantle,0,0,0);
    if (octopus) {
      const cups = [];
      for (let j=1;j<=9;j++) {
        const t=j/10, p=path.getPointAt(t), s=.048*(1-t*.68);
        for (const z of [-1,1]) cups.push({position:[p.x,p.y-.05*(1-t*.76),p.z+z*s*.61],scale:[s,s*.36,s],
          color:j%2?'#dab194':'#c98d7a'});
      }
      placeInstances(arm,hull,pigment('#fff'),cups);
    }
    arms.push({arm,angle,phase:random()*6});
  }
  const fins=[];
  if (!octopus) for (const side of [-1,1]) {
    const geometry=resources.keep(new THREE.SphereGeometry(1,26,12));
    const blade=placeMesh(node,geometry,pigment('#d6b991'),-.20,.14,side*.30,.82,.042,.21);
    fins.push(blade);
  }
  return (time,_day,bite,mode,speed=0) => {
    head.scale.y=(octopus?.40:.24)*(1+.095*Math.sin(time*2.3));
    const reaching=mode==='inspect' || mode==='feed';
    for(const {arm,angle,phase} of arms) {
      arm.rotation.y=angle + (.13+.20*speed)*Math.sin(time*(octopus?2.17:3.5)+phase);
      arm.rotation.z=(.064+.13*speed)*Math.cos(time*2.24+phase)+(bite?.18:0)+(mode==='rest'?.18:0);
      arm.scale.x+=((reaching?1.16:mode==='rest'?.78:1)-arm.scale.x)*.14;
    }
    fins.forEach((fin,i)=>{ fin.rotation.x=Math.sin(time*(5.1+speed*2.4)+i*Math.PI)*(.16+speed*.18); });
  };
}

export function makeMollusc(node, parts, resources, uniforms, id) {
  if (['clam','scallop','mussel','oyster'].includes(id)) return bivalve(node,parts,resources,uniforms,id);
  if (id==='nudibranch'||id==='cucumber') return slug(node,parts,id);
  if (id==='featherStar') return featherStar(node,parts);
  if (id==='octopus'||id==='cuttlefish') return cephalopod(node,parts,resources,uniforms,id);
  return snail(node,parts,resources,uniforms,id);
}
