import * as THREE from '../../node_modules/three/build/three.module.js';
import { waterColourShader } from './aquarium-water.mjs';

export function seededRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = Math.imul(state ^ state >>> 15, state | 1);
    value ^= value + Math.imul(value ^ value >>> 7, value | 61);
    return ((value ^ value >>> 14) >>> 0) / 4294967296;
  };
}

export function aquariumResources() {
  const resources = new Set();
  return {
    keep(resource) { resources.add(resource); return resource; },
    dispose() { for (const resource of resources) resource.dispose(); resources.clear(); },
  };
}

const causticShader = /* glsl */`
  uniform float tankTime;
  uniform float tankLight;
  uniform float tankFlow;
  uniform float surfaceHeight;
  varying vec3 tankWorld;
  float causticScore(vec2 p) {
    float beat=tankTime*(.44+tankFlow*.65);
    vec2 q=p+vec2(sin(p.y*.71+p.x*.46+beat*.38),cos(p.x*.81-p.y*.38-beat*.31))*.94;
    q+=vec2(cos(p.y*2.18+p.x*.47+beat*.21),sin(p.x*2.03-p.y*.61-beat*.29))*.26;
    float a=abs(sin(q.x*1.17+q.y*.55+cos(q.y*1.31)*.73));
    float b=abs(sin(q.y*1.28-q.x*.47+sin(q.x*1.34)*.71));
    float spots=.49+.51*pow(.5+.5*sin(p.x*.61-p.y*.53+beat*.22),2.);
    return (pow(1.-min(a,b),16.)*.66+pow(1.-max(a,b),8.)*.43)*spots;
  }
`;

export function waterLit(resources, uniforms, options, { grain = 'none', sway = 0 } = {}) {
  const material = resources.keep(new THREE.MeshStandardMaterial({ ...options, fog: grain !== 'sand' }));
  const rockMap=grain==='rock' && Boolean(uniforms.tankRockMap?.value);
  const sandMap=grain==='sand' && Boolean(uniforms.tankSandMap?.value);
  material.customProgramCacheKey = () => `aquarium-surface-${grain}-${sway}-${rockMap || sandMap}`;
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = /* glsl */`
      uniform float tankTime;
      uniform float tankFlow;
      varying vec3 tankWorld;
    ` + shader.vertexShader.replace('#include <project_vertex>', /* glsl */`
      vec4 tankPosition = vec4(transformed, 1.);
      #ifdef USE_INSTANCING
        tankPosition = instanceMatrix * tankPosition;
      #endif
      tankWorld = (modelMatrix * tankPosition).xyz;
      #include <project_vertex>
    `).replace('#include <begin_vertex>', /* glsl */`
      #include <begin_vertex>
      float drift=tankTime*(.42+tankFlow*.73);
      vec2 anchor=modelMatrix[3].xz;
      #ifdef USE_INSTANCING
        anchor+=(modelMatrix*vec4(instanceMatrix[3].xyz,0.)).xz;
      #endif
      float bend=position.y*position.y/(1.+position.y*.38);
      transformed.x += ${sway.toFixed(3)}*bend*sin(drift*1.1+position.y*.69+anchor.x*.73)*tankFlow;
      transformed.z += ${sway.toFixed(3)}*position.y*cos(drift*.85+position.y*.93+anchor.y*.68)*tankFlow;
    `);
    let surface = '';
    if (grain === 'sand') surface = /* glsl */`
      vec2 bed = tankWorld.xz;
      float ripple=sin(bed.y*4.1+sin(bed.x*.65)*1.2+sin(bed.x*1.9+bed.y*.88)*.64);
      float drift=sin(bed.x*.39+bed.y*.74)*cos(bed.y*.29-bed.x*.24);
      diffuseColor.rgb *= .91 + ripple*.05 + drift*.17;
      ${sandMap ? /* glsl */`
        vec3 grains=texture2D(tankSandMap,bed*.42).rgb;
        vec3 largerGrains=texture2D(tankSandMap,bed*.17+vec2(.26,.69)).rgb;
        diffuseColor.rgb *= .67 + .91*grains + .29*largerGrains;
      ` : ''}
    `;
    if (grain === 'rock') surface = /* glsl */`
      vec3 stone=tankWorld*3.1;
      float strata=sin(stone.y*.97+stone.x*.41+sin(stone.z*.29)*1.62);
      float moss=sin(stone.x*.76+stone.z*.32)*cos(stone.z*.49+stone.y*.37);
      diffuseColor.rgb *= .91 + .115*strata + .09*moss;
      ${rockMap ? /* glsl */`
        vec3 fineTex = aquariumRockTexel(tankWorld * .63);
        vec3 weathering = aquariumRockTexel(tankWorld*.21+vec3(.3,.17,.64));
        diffuseColor.rgb *= .40 + 1.53*fineTex + .55*weathering;
        diffuseColor.rgb *= mix(vec3(1.),vec3(.79,.96,.71),smoothstep(.40,.81,moss)*.58);
        float rockRelief = dot(fineTex,vec3(.299,.587,.114));
      ` : ''}
    `;
    if (grain === 'organic') surface = /* glsl */`
      vec3 organic = tankWorld * 24.;
      float detail = sin(organic.x + cos(organic.y)) * sin(organic.y+organic.z*.67);
      diffuseColor.rgb *= .93 + detail*.15;
    `;
    if (grain === 'sponge') surface = /* glsl */`
      vec3 pores=tankWorld*40.;
      float cells=abs(sin(pores.x+cos(pores.z*.71)) * cos(pores.y*.89+sin(pores.x*.51)) * sin(pores.z*.93));
      float spongeShade=.77+.23*sin(tankWorld.y*19.+tankWorld.x*9.+sin(tankWorld.z*19.));
      diffuseColor.rgb *= spongeShade*(1.-.69*smoothstep(.79,.96,cells));
    `;
    if (grain === 'coral') surface = /* glsl */`
      vec3 p=tankWorld*22.;
      float furrows=sin(p.x + p.z*.83 + sin(p.y*1.04+p.z*.49)*1.51 + sin(p.x*.83+p.z*.65)*.58);
      diffuseColor.rgb *= .88 + .14*sin(p.y*.69+p.z*.54) - .32*smoothstep(.73,.95,furrows);
    `;
    const litSurface = shader.fragmentShader.replace('#include <color_fragment>',
      /* glsl */`#include <color_fragment>
      ${surface}
      vec2 projection = tankWorld.xz + vec2(tankWorld.y*.54,tankWorld.y*-.31);
      float caustic = causticScore(projection*1.52);
      float penetration=exp(-max(0.,surfaceHeight-tankWorld.y)*.063);
      diffuseColor.rgb *= 1.+caustic*tankLight*penetration*(.26+.38*max(0.,vNormal.y));
    `);
    const texSampling = rockMap ? /* glsl */`
      uniform sampler2D tankRockMap;
      vec3 aquariumRockTexel(vec3 p) {
        vec3 n=abs(normalize(cross(dFdx(tankWorld),dFdy(tankWorld))));
        n=pow(n,vec3(3.));
        n/=max(.001,n.x+n.y+n.z);
        return texture2D(tankRockMap,p.zy).rgb*n.x+texture2D(tankRockMap,p.xz).rgb*n.y
          +texture2D(tankRockMap,p.xy).rgb*n.z;
      }
    ` : sandMap ? 'uniform sampler2D tankSandMap;\n' : '';
    const rockBump = rockMap ? litSurface.replace('#include <normal_fragment_maps>', /* glsl */`
      #include <normal_fragment_maps>
      vec3 detailX=dFdx(-vViewPosition), detailY=dFdy(-vViewPosition);
      vec3 r1=cross(detailY,normal), r2=cross(normal,detailX);
      float det=dot(detailX,r1);
      vec3 gradient=sign(det)*(dFdx(rockRelief)*r1+dFdy(rockRelief)*r2);
      normal=normalize(max(.000001,abs(det))*normal-gradient*.083);
    `) : litSurface;
    shader.fragmentShader = causticShader + texSampling + (grain === 'sand' ? waterColourShader
      + litSurface.replace('#include <tonemapping_fragment>', /* glsl */`
        float haze=smoothstep(3.,43.,-tankWorld.z);
        if (haze > .001) gl_FragColor.rgb=mix(gl_FragColor.rgb,waterColour(gl_FragCoord.xy/tankViewport),haze);
        #include <tonemapping_fragment>
      `) : rockBump);
  };
  return material;
}

export function placeMesh(parent, geometry, material, x, y, z, sx = 1, sy = sx, sz = sx) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(x, y, z);
  mesh.scale.set(sx, sy, sz);
  parent.add(mesh);
  return mesh;
}

export function placeInstances(parent, geometry, material, parts) {
  if (!parts.length) return;
  const mesh = new THREE.InstancedMesh(geometry, material, parts.length);
  const transform = new THREE.Object3D();
  const tint = new THREE.Color();
  for (const [index, part] of parts.entries()) {
    transform.position.set(...part.position);
    transform.scale.set(...part.scale);
    if (part.quaternion) transform.quaternion.copy(part.quaternion);
    else transform.rotation.set(...(part.rotation ?? [0, 0, 0]));
    transform.updateMatrix();
    mesh.setMatrixAt(index, transform.matrix);
    if (part.color) mesh.setColorAt(index, tint.set(part.color));
  }
  parent.add(mesh);
  return mesh;
}
