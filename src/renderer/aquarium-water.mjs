import * as THREE from '../../node_modules/three/build/three.module.js';

export const WATERS = {
  clear: { top: '#388ca4', deep: '#144154', night: '#245280', dark: '#0b223c', fog: .027, light: '#e0ffff' },
  coastal: { top: '#408e80', deep: '#23534d', night: '#245060', dark: '#0b2831', fog: .034, light: '#e6ffdc' },
  tannin: { top: '#a58855', deep: '#3d4232', night: '#3b554b', dark: '#152c2a', fog: .039, light: '#fff2c8' },
  lagoon: { top: '#6dc4bd', deep: '#21637c', night: '#2d5c86', dark: '#0a384c', fog: .020, light: '#eeffee' },
  abyss: { top: '#345d8d', deep: '#172950', night: '#1b3962', dark: '#0b1b35', fog: .034, light: '#c9ebff' },
};

export const waterColourShader = /* glsl */`
  uniform float tankAspect;
  uniform vec2 tankViewport;
  uniform vec3 surfaceColor;
  uniform vec3 deepColor;
  uniform vec3 shaftColor;

  float waterGrain(vec2 p) {
    return fract(52.9829189*fract(dot(p, vec2(.06711056, .00583715))));
  }
  vec3 waterColour(vec2 uv) {
    float depth = 1. - uv.y;
    vec2 px = vec2((uv.x-.5) * clamp(tankAspect,.7,3.8), depth);
    float time = tankTime*(.48+tankFlow*.65);
    float wav = sin(px.x*12. + depth*6. + time*.36)*.019
      + sin(px.x*28. - depth*4. - time*.51)*.009;
    float focus=exp(-pow((px.x+.43+depth*.29)*.91,2.));
    float fade = pow(uv.y,2.04);
    vec3 water = mix(deepColor, surfaceColor, fade*(.36+.48*focus)+.105);
    vec2 beam = vec2(px.x + depth*.5 + wav, depth);
    float broad = sin(beam.x*6.75+1.)*.5 + .5;
    float shear = beam.x*.73 + sin(beam.y*1.7)*.19;
    float ribbons = pow(.5+.5*sin(shear*13. + 1.1), 7.)*.57
      + pow(.5+.5*sin(shear*35. - tankTime*.28), 8.)*.22
      + pow(.5+.5*sin(shear*22.6 + tankTime*.12), 12.)*.36;
    float pools = exp(-pow((px.x+.51-depth*.38)*1.6,2.)) + .60*exp(-pow((px.x-.76-depth*.67)*2.45,2.));
    float shaft = (ribbons + .11*broad) * (.13+.87*pools) * (1.-smoothstep(.12,.93,depth)) * exp(-depth*1.22);
    float intensity = .085 + .54*tankLight;
    water += shaftColor*shaft*.31*intensity;
    water += (waterGrain(gl_FragCoord.xy)-.5)*.009*max(.27,fade);
    return max(water,vec3(0.));
  }
`;

export function makeWaterBackdrop(scene, resources, uniforms, profile) {
  const geometry = resources.keep(new THREE.PlaneGeometry(2, 2));
  const top = new THREE.Color(profile.top), deep = new THREE.Color(profile.deep);
  const night = new THREE.Color(profile.night), dark = new THREE.Color(profile.dark);
  const warm = new THREE.Color('#dc9a66');
  Object.assign(uniforms, { surfaceColor: { value: top.clone() }, deepColor: { value: deep.clone() },
    shaftColor: { value: new THREE.Color(profile.light) }, tankAspect: { value: 1 }, tankViewport: { value: new THREE.Vector2(1,1) } });
  const material = resources.keep(new THREE.ShaderMaterial({
    depthTest: false, depthWrite: false, uniforms,
    vertexShader: /* glsl */`
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = vec4(position.xy, .9999, 1.);
      }
    `,
    fragmentShader: /* glsl */`
      varying vec2 vUv;
      uniform float tankTime;
      uniform float tankLight;
      uniform float tankFlow;
      ${waterColourShader}
      void main() {
        gl_FragColor = vec4(waterColour(vUv),1.);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  }));
  const backdrop = new THREE.Mesh(geometry, material);
  backdrop.renderOrder = -100;
  backdrop.frustumCulled = false;
  scene.add(backdrop);
  return {
    resize(aspect, width, height) {
      uniforms.tankAspect.value = aspect;
      uniforms.tankViewport.value.set(width,height);
    },
    light(day, twilight) {
      uniforms.surfaceColor.value.copy(night).lerp(top, day).lerp(warm, .24*twilight);
      uniforms.deepColor.value.copy(dark).lerp(deep, day).lerp(warm, .045*twilight);
    },
  };
}

export function makeWaterSurface(scene,resources,uniforms,waterline) {
  const geometry = resources.keep(new THREE.PlaneGeometry(124,86,42,33));
  geometry.rotateX(Math.PI/2).translate(0,waterline,-26);
  const material = resources.keep(new THREE.ShaderMaterial({
    uniforms, transparent:true, depthWrite:false,
    vertexShader: /* glsl */`
      uniform float tankTime;
      uniform float tankFlow;
      varying vec3 surfacePoint;
      void main() {
        vec3 water=position;
        water.y+=sin(water.x*.95+water.z*.46+tankTime*.81)*.055*tankFlow;
        surfacePoint=(modelMatrix*vec4(water,1.)).xyz;
        gl_Position=projectionMatrix*viewMatrix*vec4(surfacePoint,1.);
      }
    `,
    fragmentShader: /* glsl */`
      uniform float tankTime;
      uniform float tankFlow;
      uniform float tankLight;
      uniform vec3 surfaceColor;
      uniform vec3 deepColor;
      uniform vec3 shaftColor;
      varying vec3 surfacePoint;
      void main() {
        vec2 q=surfacePoint.xz;
        float t=tankTime*(.54+tankFlow*.63);
        vec2 bands=q*vec2(.80,1.22);
        float a=dot(bands,vec2(1.44,.68))+t*1.04;
        float b=dot(bands,vec2(.81,-1.17))-t*.85;
        vec2 wave=vec2(sin(a),cos(b))*.24 + vec2(cos(a*1.61-b*.27),sin(b*1.17+a*.27))*.078;
        vec3 normal=normalize(vec3(wave.x*tankFlow,-1.,wave.y*tankFlow));
        vec3 sight=normalize(cameraPosition-surfacePoint);
        float r=pow(1.-clamp(dot(normal,sight),0.,1.),3.);
        float distanceToEye=length(cameraPosition-surfacePoint);
        float fading=1.-smoothstep(22.,52.,distanceToEye);
        vec3 reflected=reflect(-sight,normal);
        vec3 key=normalize(vec3(-.25,-.28,.92));
        float sparkle=pow(max(dot(reflected,key),0.),12.);
        float surfA=sin(a+b*.21+sin(a*.34-b*.7)*1.1);
        float surfB=sin(b-a*.33+cos(b*.42+a*.62)*.91);
        float folds=pow(max(abs(surfA),abs(surfB)),8.)*pow(1.-min(abs(surfA),abs(surfB)),5.);
        float gleam=(.03+.22*folds+.46*sparkle)*(.18+.82*tankLight);
        vec3 colour=mix(deepColor,surfaceColor,.47+.28*r)+shaftColor*gleam;
        gl_FragColor=vec4(colour,clamp((.22+.28*r+.25*folds)*fading,0.,.63));
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  }));
  const surface = new THREE.Mesh(geometry,material);
  surface.renderOrder=5;
  scene.add(surface);
}

export function makeTankGlass(scene, resources, uniforms, tank) {
  if (tank === 'panorama') return;
  const material = resources.keep(new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, depthTest: false, toneMapped: false,
    uniforms: { tankAspect: uniforms.tankAspect, framed: { value: Number(tank === 'cabinet') } },
    vertexShader: /* glsl */`
      varying vec2 pane;
      void main() {
        pane=uv;
        gl_Position=vec4(position.xy,0.,1.);
      }
    `,
    fragmentShader: /* glsl */`
      uniform float tankAspect;
      uniform float framed;
      varying vec2 pane;
      void main() {
        vec2 ratio=vec2(max(tankAspect,1.),max(1./tankAspect,1.));
        vec2 edge=min(pane,1.-pane)*ratio;
        float seam=min(edge.x,edge.y);
        float rim=1.-smoothstep(.002,.005,abs(seam-mix(.010,.023,framed)));
        float frame=(1.-smoothstep(.018,.023,seam))*framed;
        float fog=exp(-edge.x*38.)*.17+exp(-edge.y*49.)*.06;
        float windowReflection=exp(-pow((pane.x+pane.y*.13-.081)*59.,2.))*.11 +
          exp(-pow((pane.x+pane.y*.12-.122)*145.,2.))*.10;
        float shine=(rim*.37 + fog + windowReflection) * (1.-frame);
        vec3 tint=mix(vec3(.51,.76,.78),vec3(.05,.10,.123),frame);
        gl_FragColor=vec4(tint,max(shine,frame*.94));
      }
    `,
  }));
  const glass = new THREE.Mesh(resources.keep(new THREE.PlaneGeometry(2,2)),material);
  glass.frustumCulled=false;
  glass.renderOrder=39;
  scene.add(glass);
}

export function makeWaterParticles(scene, resources, uniforms, random, settings, size, vents, floor) {
  const count = settings.quality === 'high' ? 750 : settings.quality === 'eco' ? 260 : 475;
  const spread=settings.bubblePattern==='mixed'||settings.bubblePattern==='scattered';
  const ordinary=settings.bubblePattern==='vents' ? [] :
    [{x:-.58*size,z:5.1},{x:.35*size,z:-8.7},{x:.82*size,z:-6.1},{x:-.36*size,z:-13.8}];
  const spots=[...vents,...ordinary];
  const density=settings.bubbleDensity/100;
  const bubbleCount=settings.bubbles && spots.length ? Math.round(density*((settings.quality==='eco'?94:144)+vents.length*18)) : 0;
  const coordinates = [], traits = [];
  for (let i = 0; i < count + bubbleCount; i++) {
    const bubble = i >= count;
    const bubbleIndex=i-count;
    const scattered=bubble && spread && (settings.bubblePattern==='scattered'||bubbleIndex%3===0)
      && (spots.length===ordinary.length||bubbleIndex%4!==0);
    const spot=bubble ? spots[bubbleIndex%spots.length] : null;
    const z=bubble && !scattered ? spot.z+(random()-.5)*.31 : -29+random()*40;
    const x=bubble && !scattered ? spot.x+(random()-.5)*.50 : (random()*2-1)*size*(1-z/17.5)*1.13;
    const phase=random();
    coordinates.push(x,phase*8.3,z);
    traits.push(phase,.32+random()*(bubble?1.25:.9),bubble ? 1:0,bubble ? floor(x,z)+.075 : 0);
  }
  const geometry = resources.keep(new THREE.BufferGeometry());
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(coordinates, 3));
  geometry.setAttribute('particle',new THREE.Float32BufferAttribute(traits,4));
  const state = { ...uniforms, viewportScale: { value: 1 } };
  const material = resources.keep(new THREE.ShaderMaterial({
    uniforms: state, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */`
      uniform float tankTime;
      uniform float tankFlow;
      uniform float surfaceHeight;
      uniform float viewportScale;
      attribute vec4 particle;
      varying vec3 vParticle;
      void main() {
        float kind = particle.z;
        float phase = particle.x*6.283;
        vec3 drift = position;
        float origin=particle.w;
        float column=max(1.,surfaceHeight-origin);
        float age=mod(position.y + tankTime * mix(.035,.82,kind)*particle.y,column+kind*1.6);
        drift.y=origin+min(age,column);
        drift.x+=sin(drift.y*(1.+kind*2.)+phase+tankTime*.45)*mix(.32,.18,kind)*(.54+tankFlow)
          + kind*age*tankFlow*.049;
        drift.z+=cos(phase+tankTime*.21)*mix(.38,.19,kind);
        vec4 p = modelViewMatrix * vec4(drift,1.);
        gl_Position = projectionMatrix * p;
        gl_PointSize=clamp(viewportScale*(21.+88.*kind)*particle.y/-p.z,.6,13.);
        float depthFade=1.-smoothstep(19.,47.,-p.z);
        vParticle=vec3(kind,.66+.34*sin(phase+tankTime*.74),
          smoothstep(.02,.57,age)*(1.-smoothstep(column-.49,column,age))*depthFade);
      }
    `,
    fragmentShader: /* glsl */`
      uniform float tankLight;
      varying vec3 vParticle;
      void main() {
        vec2 uv = gl_PointCoord - .5;
        float r = length(uv);
        float mote = (1.-smoothstep(.04,.5,r)) * .30;
        float bubble=smoothstep(.26,.39,r)*(1.-smoothstep(.44,.5,r));
        bubble*=.27+.73*smoothstep(-.16,.29,(-uv.x+uv.y)*.94);
        bubble+=.37*exp(-dot(uv-vec2(-.20,.245),uv-vec2(-.20,.245))*139.);
        gl_FragColor=vec4(.67,.91,1.,mix(mote,bubble,vParticle.x)*vParticle.y*vParticle.z*(.31+.58*tankLight));
      }
    `,
  }));
  scene.add(new THREE.Points(geometry, material));
  return (height) => { state.viewportScale.value = height / 650; };
}
