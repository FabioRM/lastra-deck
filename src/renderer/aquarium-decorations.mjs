import * as THREE from '../../node_modules/three/build/three.module.js';
import { placeInstances, placeMesh, waterLit } from './aquarium-materials.mjs';
import { makeAlgaePatch, makeSpongePatch } from './aquarium-growth.mjs';
import { makeMusselBed } from './aquarium-molluscs.mjs';
import { makeCoralThicket } from './aquarium-habitat.mjs';

export function makeDecorations(scene, resources, uniforms, floorAt, width, decorations, random, quality) {
  if (!decorations.length) return [];
  const stone = waterLit(resources,uniforms,{color:'#fff',roughness:.91},{grain:'rock'});
  const wood = waterLit(resources,uniforms,{color:'#725c48',roughness:.96,side:THREE.DoubleSide},{grain:'rock'});
  const iron = waterLit(resources,uniforms,{color:'#686953',roughness:.78,metalness:.32},{grain:'organic'});
  const clay = waterLit(resources,uniforms,{color:'#a76b53',roughness:.83,side:THREE.DoubleSide},{grain:'organic'});
  const pebble = resources.keep(new THREE.IcosahedronGeometry(1,2));
  const box = resources.keep(new THREE.BoxGeometry(1,1,1));
  const branch = (group, points, radius, material = wood) => {
    const curve = new THREE.CatmullRomCurve3(points.map(point => new THREE.Vector3(...point)));
    const shape = resources.keep(new THREE.TubeGeometry(curve,16,radius,7));
    return placeMesh(group,shape,material,0,0,0);
  };

  function arch(group) {
    const layers = [];
    for (let ring=0; ring<2; ring++) for (let i=0; i<=13; i++) {
      const angle=Math.PI*i/13;
      const h=.39+Math.sin(angle)*(2.4+ring*.19);
      const block=.41+random()*.24;
      layers.push({ position:[Math.cos(angle)*(2.24+ring*.35),h,-ring*.36+(random()-.5)*.21],
        scale:[block*1.21,block,block*.88], rotation:[i*.38,random()*3.2,angle*.91],
        color:['#81796c','#9e9480','#999776','#748371'][i%4] });
    }
    for (const side of [-1,1]) for (let i=0;i<9;i++) {
      const size=.19+random()*.44;
      layers.push({ position:[side*(2.15+random()*.8),.14+size*.17,(random()-.5)*1.9],
        scale:[size*1.3,size*.7,size], color:'#8a8878', rotation:[random(),random()*3,random()*.3] });
    }
    placeInstances(group,pebble,stone,layers);
  }

  function hullGeometry() {
    const vertices=[], indices=[];
    const sections=32, planks=18;
    for (let i=0;i<=sections;i++) {
      const u=i/sections, taper=Math.pow(Math.sin(Math.PI*(.025+u*.95)),.8);
      for (let j=0;j<=planks;j++) {
        const turn=(j/planks-.5)*Math.PI;
        const sheer=.24 + Math.abs(u-.53)**1.9*1.7;
        const fractured=u>.31 && u<.69 && j<=3 && ((i+j)%4<2);
        vertices.push((u-.5)*7.3,sheer + (1-Math.cos(turn))*1.58*taper + (fractured?-.16:0),
          Math.sin(turn)*1.46*taper);
        if (!i || !j || (fractured && (i+j)%3===0)) continue;
        const k=vertices.length/3-1, a=k-planks-2, b=k-planks-1;
        indices.push(a,b,k-1,k-1,b,k);
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    return geometry;
  }

  function wreck(group) {
    const lightWood=waterLit(resources,uniforms,{color:'#8b7658',roughness:.94,side:THREE.DoubleSide},{grain:'rock'});
    placeMesh(group,resources.keep(hullGeometry()),wood,0,0,0);
    group.rotation.x=.22;
    for (let i=0; i<8; i++) {
      const x=(i/7-.5)*5.55, breadth=Math.pow(1-Math.abs(x)/4.4,.58);
      branch(group,[[x,1.74,-1.44*breadth],[x,.85,-.97*breadth],[x,.47,0],[x,.78,.96*breadth],[x,1.47,1.31*breadth]],
        .077,lightWood);
    }
    for (const side of [-1,1]) for (let i=0;i<4;i++) {
      const y=.74+i*.29, span=(.72+i*.15)*side;
      branch(group,[[-3.45,1.08,span*.22],[-2.07,y,span*.8],[-.75,y-.05,span],[1.08,y+.08,span*.94],[2.57,y+.16,span*.76],
        [3.67,1.28,span*.21]],.025,lightWood);
    }
    branch(group,[[-.72,.33,.09],[-.66,1.34,.14],[-.57,2.39,.09],[.05,3.26,.37]],.137,wood);
    branch(group,[[-.88,2.25,-.89],[-.62,2.32,.13],[-.52,2.39,1.0]],.061,wood);
    branch(group,[[2.84,.63,0],[3.55,1.16,.03],[3.63,1.78,.08]],.11,lightWood);
    const nails=[];
    for (let i=0;i<45;i++) {
      const x=(random()-.5)*5.45, sign=i%2 ? 1:-1;
      const z=sign*(1.28-Math.abs(x)*.17)*(i%3===0?.69:1);
      nails.push({position:[x,.94+(i%3)*.19,z],scale:[.046,.046,.046]});
    }
    placeInstances(group,pebble,iron,nails);
  }

  function masonry(group, basalt) {
    const parts=[];
    for (let i=0; i<(basalt?11:19); i++) {
      const size=.24+random()*.42;
      if (basalt) parts.push({ position:[(random()-.5)*3.3,size*.7,(random()-.5)*1.85],
        scale:[size,size*(1.8+random()*3.5),size], rotation:[(random()-.5)*.25,random()*6.28,(random()-.5)*.19],
        color:['#586064','#434b49','#717767'][i%3] });
      else {
        const pillar=i<12, row=pillar?Math.floor(i/3):0, column=i%3-1;
        parts.push({position:[pillar?column*1.1:(random()-.5)*3.7,.22+row*.43,pillar ? column*.21 : (random()-.5)*1.9],
          scale:[.53+size*.34,.39+size*.08,.52+size*.43],rotation:[(random()-.5)*.25,random()*.63,(random()-.5)*.27],
          color:['#8b8c76','#a2a38b','#777f6c'][i%3]});
      }
    }
    const shape=basalt ? resources.keep(new THREE.CylinderGeometry(.81,1,1,6)) : box;
    placeInstances(group,shape,stone,parts);
  }

  function driftwood(group) {
    for (let i=0;i<9;i++) {
      const side=i%2 ? 1:-1, height=1.15+random()*2.25;
      const stretch=side*(.52+random()*2.62);
      branch(group,[[0,.09,0],[side*.21,.45,.17],[stretch*.58,height*.64,(random()-.5)*.82],
        [stretch,height,.41+random()*.71]],.052+random()*.13);
    }
  }

  function vase(group, sponge) {
    const profile=sponge ? [[0,0],[.26,.04],[.52,.35],[.56,1.21],[.51,1.37],[.44,1.38],[.32,1.18],[.29,.48],[.03,.29]]
      : [[0,0],[.33,0],[.51,.21],[.69,.54],[.64,.88],[.40,1.13],[.33,1.22],[.35,1.34],[.27,1.36],[.25,1.22],[.49,.70],[.47,.19],[0,.12]];
    const geometry=resources.keep(new THREE.LatheGeometry(profile.map(([x,y])=>new THREE.Vector2(x,y)),26));
    const count=sponge?7:1;
    const material=sponge ? waterLit(resources,uniforms,{color:'#b78363',roughness:.9,side:THREE.DoubleSide},{grain:'organic'}) : clay;
    for (let i=0;i<count;i++) {
      const size=sponge?.38+random()*.63:1.13;
      const angle=i*2.4;
      const object=placeMesh(group,geometry,material,Math.sin(angle)*i*.176,.03,Math.cos(angle)*i*.16,size);
      object.rotation.z=sponge?.16*Math.sin(angle):.72;
    }
  }

  const vents=[];
  for (const item of decorations) {
    const x=item.x/100*width*.88, z=5.5-item.depth*.174;
    const group=new THREE.Group();
    group.position.set(x,floorAt(x,z),z);
    group.rotation.y=item.rotation*Math.PI/180;
    group.scale.setScalar(item.size/100);
    scene.add(group);
    switch (item.type) {
      case 'arch': arch(group); break;
      case 'wreck': wreck(group); break;
      case 'ruins': masonry(group,false); break;
      case 'boulders': masonry(group,true); break;
      case 'driftwood': driftwood(group); break;
      case 'sponge': vase(group,true); break;
      case 'kelpPatch': makeAlgaePatch(group,resources,uniforms,random,'kelp'); break;
      case 'redAlgae': makeAlgaePatch(group,resources,uniforms,random,'red'); break;
      case 'tubeSponges': makeSpongePatch(group,resources,uniforms,random,'tube'); break;
      case 'fanSponge': makeSpongePatch(group,resources,uniforms,random,'fan'); break;
      case 'musselBed': makeMusselBed(group,resources,uniforms,random); break;
      case 'coralThicket': makeCoralThicket(group,resources,uniforms,random,quality); break;
      case 'jar': vase(group,false); break;
      case 'vent':
        placeMesh(group,pebble,iron,0,.08,0,.64,.15,.57);
        vents.push({ x,z });
        break;
    }
    group.traverse((node)=>{ if (node.isMesh && node.material.isMeshStandardMaterial) node.castShadow=true; });
  }
  return vents;
}
