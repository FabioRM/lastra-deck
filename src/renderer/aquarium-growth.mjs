import * as THREE from '../../node_modules/three/build/three.module.js';
import { placeInstances, placeMesh, waterLit } from './aquarium-materials.mjs';

const ALGAE_COLOURS = {
  kelp: ['#887545','#69754a','#504d32'],
  red: ['#9e4d55','#a45983','#6d405b'],
  green: ['#699345','#7ca453','#486e42'],
};

function algaeGeometry(kind, random) {
  const positions=[], colors=[], indices=[];
  const palette=ALGAE_COLOURS[kind].map(value=>new THREE.Color(value));
  const colour=new THREE.Color();
  function ribbon(rootX, rootY, rootZ, angle, height, breadth, curl, index) {
    const sections=kind==='kelp' ? 20 : 13, cross=5;
    const offset=positions.length/3, dx=Math.cos(angle), dz=Math.sin(angle);
    for (let i=0;i<=sections;i++) {
      const t=i/sections;
      const arc= t*t*curl + Math.sin(t*9+index)*t*.108;
      const taper=Math.pow(Math.max(.003,Math.sin(Math.PI*(.075+.925*t))),kind==='green'?.53:.83);
      const wide=breadth*taper*(1+.22*Math.sin(t*(kind==='kelp'?29:38)+index));
      const y=rootY+height*t*(1-t*(kind==='green'?.32:.12));
      for (let j=0;j<cross;j++) {
        const side=2*j/(cross-1)-1;
        const frill=wide*((1-side*side)*.18+side*.24*Math.sin(t*24+index));
        positions.push(rootX+dx*arc-dz*side*wide,y+frill,rootZ+dz*arc+dx*side*wide);
        colour.copy(palette[index%3]).multiplyScalar(.68 + t*.48 + .15*(1-Math.abs(side))
          + .10*Math.sin(t*46+side*.6+index));
        colors.push(colour.r,colour.g,colour.b);
        if(i && j) {
          const k=offset+i*cross+j;
          indices.push(k-cross-1,k-1,k-cross,k-cross,k-1,k);
        }
      }
    }
  }
  const branches=kind==='kelp' ? 8 : kind==='red' ? 11 : 13;
  for (let i=0;i<branches;i++) {
    const a=i*2.39996 + random()*.31;
    const height=kind==='kelp' ? 2.18+random()*2.44 : kind==='red' ? .68+random()*1.02 : .41+random()*1.15;
    const width=kind==='kelp' ? .13+random()*.14 : kind==='red' ? .047+random()*.074 : .19+random()*.19;
    const reach=kind==='green' ? .58+random()*.51 : .45+random()*.54;
    const x=Math.cos(a)*random()*.31, z=Math.sin(a)*random()*.31;
    ribbon(x,0,z,a,height,width,reach,i);
    if (kind==='red') {
      ribbon(x+.19*Math.cos(a),height*.38,z+.19*Math.sin(a),a+.71,height*.62,width*.57,reach*.66,i+1);
      ribbon(x+.28*Math.cos(a),height*.50,z+.28*Math.sin(a),a-.67,height*.48,width*.52,reach*.56,i+2);
    }
  }
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions,3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors,3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function algaeMaterial(resources, uniforms, kind) {
  return waterLit(resources,uniforms,{color:'#fff',roughness:.78,side:THREE.DoubleSide,vertexColors:true},
    {grain:'organic',sway:kind==='kelp'?.143:.245});
}

export function makeAlgaePatch(scene,resources,uniforms,random,kind) {
  placeMesh(scene,resources.keep(algaeGeometry(kind,random)),algaeMaterial(resources,uniforms,kind),0,0,0);
}

function growSites(random, visibleWidth, floor, banks, amount) {
  return Array.from({length:amount},(_,index)=>{
    const bank=banks[index%banks.length];
    const bankSide=bank.x>0 ? 1:-1;
    const z=index%3===0 ? -16+random()*24 : bank.z+.11+random()*2.54;
    const nearEdge=index%5===0;
    const x=nearEdge ? bankSide*visibleWidth(z)*(.77+random()*.24) : bank.x-bankSide*(.38+random()*1.81);
    return [x,floor(x,z)+.02,z];
  });
}

export function makeSeaweed(scene,resources,uniforms,random,settings,banks,visibleWidth,floor) {
  const amount=Math.round(settings.algaeDensity*(settings.quality==='eco'?.30:.48));
  if (!amount) return;
  const types=settings.algae==='mixed' ? ['green','red','kelp','green','red'] : [settings.algae];
  const batches=new Map();
  for (const [i,position] of growSites(random,visibleWidth,floor,banks,amount).entries()) {
    const kind=types[i%types.length];
    const base=kind==='kelp' ? .32 : .66;
    const size=base+random()*(kind==='kelp'?.43:.47);
    const tint=['#fff8e7','#c8cbb3','#d7ded0','#f2e6bc'][i%4];
    const group=batches.get(kind) ?? [];
    group.push({position,scale:[size*(.8+random()*.28),size,size],rotation:[0,random()*6.28,0],color:tint});
    batches.set(kind,group);
  }
  for (const [kind,group] of batches) {
    const shape=resources.keep(algaeGeometry(kind,random));
    placeInstances(scene,shape,algaeMaterial(resources,uniforms,kind),group);
  }
}

function spongeShape(kind) {
  const profile=kind==='barrel'
    ? [[0,0],[.35,.05],[.59,.34],[.62,.82],[.54,1.11],[.46,1.21],[.37,1.18],[.38,1.07],[.36,.58],[.19,.23],[0,.23]]
    : [[0,0],[.25,.05],[.38,.44],[.45,.86],[.45,1.15],[.37,1.25],[.28,1.21],[.28,1.15],[.26,.89],[.15,.24],[0,.19]];
  const shape=new THREE.LatheGeometry(profile.map(([x,y])=>new THREE.Vector2(x,y)),kind==='barrel'?22:15);
  const points=shape.attributes.position;
  for (let i=0;i<points.count;i++) {
    const x=points.getX(i), y=points.getY(i), z=points.getZ(i);
    const a=Math.atan2(z,x);
    const ridge=1+Math.sin(a*7+y*2.5)*.095+Math.cos(a*4-y*7)*.046;
    points.setXYZ(i,x*ridge,y+Math.sin(a*5)*.061*y,z*ridge);
  }
  shape.computeVertexNormals();
  return shape;
}

function addSpongeCluster(target, random, type, position, size, palette, floor) {
  const [x,y,z]=position;
  const amount=type==='fan' ? 9 : type==='barrel' ? 4 : 6;
  const direction=random()*6.28;
  for (let i=0;i<amount;i++) {
    const a=i*2.39996+direction;
    const radius=Math.sqrt(i/amount)*size*.66;
    const width=size*(type==='barrel' ? .49+random()*.38 : .26+random()*.26);
    const height=size*(type==='fan' ? .62+Math.sin((i+.5)/amount*Math.PI)*.50 : .49+random()*.92);
    const px=type==='fan' ? x+Math.cos(direction)*(i/(amount-1)-.5)*size*1.35 : x+Math.cos(a)*radius;
    const pz=type==='fan' ? z+Math.sin(direction)*(i/(amount-1)-.5)*size*1.35 : z+Math.sin(a)*radius;
    const base=floor ? floor(px,pz)-.013 : y;
    target.push({position:[px,base,pz],scale:[width,height,width*(type==='fan'?.55:1)],
      rotation:[(random()-.5)*.37,direction+random()*.39,(random()-.5)*.40],color:palette[i%palette.length]});
  }
}

export function makeSpongePatch(scene,resources,uniforms,random,type) {
  const instances=[];
  addSpongeCluster(instances,random,type,[0,0,0],1.28,['#d99d65','#c37c56','#d89c80']);
  const material=waterLit(resources,uniforms,{color:'#fff',roughness:.88,side:THREE.DoubleSide},{grain:'sponge'});
  placeInstances(scene,resources.keep(spongeShape(type)),material,instances);
}

export function makeSponges(scene,resources,uniforms,random,settings,banks,visibleWidth,floor) {
  const amount=Math.round(settings.spongeDensity*(settings.quality==='eco'?.14:.25));
  if (!amount) return;
  const types=settings.spongeStyle==='mixed' ? ['tube','barrel','fan'] : [settings.spongeStyle];
  const groups=Object.fromEntries(types.map(kind=>[kind,[]]));
  const hues=[['#e0aa66','#bb8457','#dfad81'],['#a57591','#be8892','#d7a092'],['#bc775c','#a67069','#d89470']];
  for (const [i,position] of growSites(random,visibleWidth,floor,banks,amount).entries()) {
    const type=types[i%types.length], scale=.44+random()*.74;
    addSpongeCluster(groups[type],random,type,position,scale,hues[i%hues.length],floor);
  }
  const material=waterLit(resources,uniforms,{color:'#fff',roughness:.88,side:THREE.DoubleSide},{grain:'sponge'});
  for (const [kind,group] of Object.entries(groups)) placeInstances(scene,resources.keep(spongeShape(kind)),material,group);
}
