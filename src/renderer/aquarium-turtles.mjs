import * as THREE from '../../node_modules/three/build/three.module.js';
import { placeMesh, waterLit } from './aquarium-materials.mjs';

export function turtlePass(time, mode, index) {
  const elapsed = time - 1.8 - index*8.3;
  const length = mode === 'frequent' ? 19 : 24;
  const interval = mode === 'frequent' ? 31 : 62;
  if (elapsed < 0) return null;
  const age = elapsed % interval;
  return age < length ? { progress:age/length, direction:(Math.floor(elapsed/interval)+index)%2 ? -1 : 1 } : null;
}

function shellMaterial(resources, uniforms, hawksbill) {
  const material=waterLit(resources,uniforms,{color:hawksbill?'#92704c':'#797653',roughness:.64},{grain:'organic'});
  const tint=material.onBeforeCompile;
  material.customProgramCacheKey=()=>`aquarium-turtle-shell-${hawksbill}`;
  material.onBeforeCompile=(shader)=>{
    tint(shader);
    shader.vertexShader='varying vec3 carapace;\n'+shader.vertexShader.replace('#include <begin_vertex>',
      '#include <begin_vertex>\n carapace=position;');
    shader.fragmentShader='varying vec3 carapace;\n'+shader.fragmentShader.replace('#include <color_fragment>',/* glsl */`
      #include <color_fragment>
      vec2 p=vec2(carapace.x*3.6,carapace.z*2.7);
      p+=vec2(.11*sin(p.y*2.1),.065*cos(p.x*2.4));
      vec2 grid=vec2(1.,1.73205);
      vec2 a=mod(p,grid)-.5*grid;
      vec2 b=mod(p-.5*grid,grid)-.5*grid;
      vec2 scuteOffset=dot(a,a)<dot(b,b) ? a : b;
      vec2 q=abs(scuteOffset);
      float edge=max(q.x,dot(q,vec2(.5,.866)));
      float seam=smoothstep(.403,.476,edge);
      vec2 cell=p-scuteOffset;
      float shade=fract(sin(dot(cell,vec2(61.3,17.1)))*471.13);
      float lines=sin(edge*37.+.66*cos(atan(scuteOffset.y,scuteOffset.x)*4.));
      float gloss=.72+.31*shade+.10*lines;
      diffuseColor.rgb *= gloss * mix(vec3(1.),vec3(.43,.40,.35),seam*.86);
      diffuseColor.rgb += ${hawksbill ? 'vec3(.12,.058,.018)' : 'vec3(.044,.044,.018)'}*smoothstep(.69,.95,shade)*(1.-seam);
    `);
  };
  return material;
}

function flipperShape(side, rear) {
  const points=[], indices=[];
  const length=rear ? .68 : 1.21;
  const span=rear ? .27 : .39;
  for (let i=0; i<=13; i++) {
    const t=i/13, center=-.34*t-.52*t*t;
    const radius=Math.max(.013,Math.pow(Math.sin(Math.PI*(.11+.89*t)),.76));
    for (let j=0; j<=10; j++) {
      const angle=j/10*Math.PI*2;
      points.push(center+Math.cos(angle)*radius*span,
        .052*Math.sin(angle)*radius-.13*t*t, t*length*side);
      if (i && j) {
        const k=points.length/3-1;
        if (side > 0) indices.push(k-12,k-11,k-1,k-1,k-11,k);
        else indices.push(k-12,k-1,k-11,k-1,k,k-11);
      }
    }
  }
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(points,3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

export function makeTurtles(scene, resources, uniforms, settings, random, visibleWidth) {
  if (!settings.stock.greenTurtle && !settings.stock.hawksbill) return () => {};
  const dome=resources.keep(new THREE.SphereGeometry(1,35,20,0,Math.PI*2,0,Math.PI*.55));
  const body=resources.keep(new THREE.SphereGeometry(1,21,14));
  const rim=resources.keep(new THREE.TorusGeometry(1,.046,9,56).rotateX(Math.PI/2));
  const flippers=[false,true].flatMap(rear => [-1,1].map(side=>resources.keep(flipperShape(side,rear))));
  const belly=waterLit(resources,uniforms,{color:'#c1ad7f',roughness:.7},{grain:'organic'});
  const eye=resources.keep(new THREE.MeshStandardMaterial({color:'#181b16',roughness:.25}));
  const turtles=[];

  for (const id of ['greenTurtle','hawksbill']) {
    const count=settings.stock[id];
    if (!count) continue;
    const hawksbill=id==='hawksbill';
    const shell=shellMaterial(resources,uniforms,hawksbill);
    const skin=waterLit(resources,uniforms,{color:hawksbill?'#948063':'#7f8b6d',roughness:.71,side:THREE.DoubleSide},{grain:'organic'});
    for (let i=0;i<count;i++) {
      const node=new THREE.Group();
      scene.add(node);
      node.scale.setScalar((hawksbill ? .74 : .93)+random()*.19);
      placeMesh(node,dome,shell,-.105,.14,0,1.01,.51,.73);
      placeMesh(node,rim,shell,-.11,.102,0,.995,.58,.73);
      placeMesh(node,body,belly,-.095,.056,0,.93,.205,.654);
      placeMesh(node,body,skin,-1.0,.027,0,.235,.072,.10).rotation.z=.14;
      const head=new THREE.Group();
      head.position.set(.69,.094,0);
      node.add(head);
      placeMesh(head,body,skin,.09,.011,0,.35,.154,.189);
      placeMesh(head,body,skin,.32,.015,0,hawksbill?.227:.19,.172,.178);
      placeMesh(head,body,belly,.461,-.044,0,hawksbill?.123:.103,.071,.128);
      for (const side of [-1,1]) {
        placeMesh(head,body,eye,.372,.096,side*.147,.049,.042,.021);
        placeMesh(head,body,skin,.29,.13,side*.133,.105,.055,.047);
      }
      const fins=flippers.map((shape,index)=>{
        const side=index%2===0 ? -1:1, rear=index>=2;
        const pivot=new THREE.Group();
        pivot.position.set(rear?-.72:.48,.06,side*(rear?.39:.52));
        node.add(pivot);
        placeMesh(pivot,shape,skin,0,0,0);
        return {pivot,side,rear};
      });
      turtles.push({node,head,fins,phase:random()*6.28});
    }
  }

  const point=new THREE.Vector3(), ahead=new THREE.Vector3();
  function route(out, progress, direction, index, resident) {
    const arc=progress*Math.PI*2;
    const z=resident ? -4.7+Math.cos(arc)*6.8-(index%2)*3.1
      : -6.8+Math.sin(Math.PI*progress)*8.9-(index%2)*2.6+Math.sin(arc)*1.26;
    const x=resident ? Math.sin(arc)*.87 : (progress*2-1)*1.43*direction;
    out.set(visibleWidth(z)*x,2.7 + .63*Math.sin(arc+.79+index) + (index%2)*.53,z);
  }
  return (time,day) => {
    for (const [i,{node,head,fins,phase}] of turtles.entries()) {
      const resident=settings.turtleVisits==='resident';
      const pass=resident ? { progress:time/(37+i*3)+i*.36,direction:1 } :
        turtlePass(time*(.84+day*.16),settings.turtleVisits,i);
      node.visible=Boolean(pass);
      if (!pass) continue;
      route(point,pass.progress,pass.direction,i,resident);
      route(ahead,pass.progress+.002,pass.direction,i,resident);
      ahead.sub(point);
      const stroke=time*(1.9+day*.43)+phase;
      node.position.copy(point);
      node.position.y+=.094*Math.sin(stroke*2.);
      node.rotation.set(.07*Math.sin(stroke),-Math.atan2(ahead.z,ahead.x),.11*Math.sin(stroke*.49));
      head.rotation.z=.12*Math.sin(stroke*.54);
      head.rotation.y=.14*Math.sin(stroke*.38);
      for (const {pivot,side,rear} of fins) {
        const kick=stroke+(rear?1.4:0)+side*.18;
        pivot.rotation.x=side*(Math.sin(kick)*(rear?.25:.55)+.08);
        pivot.rotation.y=side*(Math.cos(kick)*(rear?.21:.32)+.10);
        pivot.rotation.z=.13*Math.sin(kick*.72);
      }
    }
  };
}
