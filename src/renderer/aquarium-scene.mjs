import * as THREE from '../../node_modules/three/build/three.module.js';
import { aquariumResources, seededRandom } from './aquarium-materials.mjs';
import { makeTankGlass, makeWaterBackdrop, makeWaterParticles, makeWaterSurface, WATERS } from './aquarium-water.mjs';
import { floorAt, makeHabitat } from './aquarium-habitat.mjs';
import { makeFish } from './aquarium-fish.mjs';
import { makeInhabitants } from './aquarium-inhabitants.mjs';
import { createFoodSimulation, makeFood } from './aquarium-feeding.mjs';
import { makeDecorations } from './aquarium-decorations.mjs';
import { loadAquariumTextures } from './aquarium-textures.mjs';
import { makeTurtles } from './aquarium-turtles.mjs';

const PIXEL_BUDGET = { eco: 670_000, balanced: 1_430_000, high: 2_350_000 };
const CURRENTS = { calm: .21, gentle: .74, strong: 1.48 };
const LIGHT_TONES = { neutral: '#d9fcff', warm: '#ffdcac', blue: '#91c7ff' };
const DEPTHS = { shallow: { lens: 33, eye: 4.1, aim: 3.05, waterline: 6.8 },
  standard: { lens: 35, eye: 3.82, aim: 3.18, waterline: 7.25 },
  deep: { lens: 39, eye: 4.03, aim: 3.31, waterline: 8.15 } };
const EYE_Z = 17.5;

function configureShadows(renderer, light, width, quality) {
  if (quality === 'eco') return;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.shadowMap.autoUpdate = false;
  renderer.shadowMap.needsUpdate = true;
  light.castShadow = true;
  light.shadow.mapSize.setScalar(quality === 'high' ? 2048 : 1024);
  light.shadow.radius = 2.6;
  light.shadow.normalBias = .055;
  light.shadow.bias = -.0005;
  const camera = light.shadow.camera;
  Object.assign(camera, { left: -width*1.44, right: width*1.44, top: 34, bottom: -25, near: .25, far: 105 });
  camera.updateProjectionMatrix();
}

function surfaceRipple(scene, resources) {
  const strength = { value: 0 };
  const geometry = resources.keep(new THREE.PlaneGeometry(6.4, 6.4));
  const material = resources.keep(new THREE.ShaderMaterial({
    uniforms: { strength }, transparent: true, depthWrite: false, depthTest: false,
    blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */`
      varying vec2 vUv;
      void main() {
        vUv=uv;
        gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);
      }
    `,
    fragmentShader: /* glsl */`
      varying vec2 vUv;
      uniform float strength;
      void main() {
        vec2 pulse=(vUv-.5)*2.;
        float r=length(pulse);
        float seat=.24+(1.-strength)*.64;
        float wave=exp(-pow((r-seat)*36.,2.)) + .36*exp(-pow((r-seat*.70)*40.,2.));
        float arc=.4+.6*sin(atan(pulse.y,pulse.x)+1.3)*.5;
        gl_FragColor=vec4(.50,.82,1.,wave*strength*.20*arc);
      }
    `,
  }));
  const ripple = new THREE.Mesh(geometry,material);
  ripple.visible = false;
  ripple.renderOrder = 30;
  scene.add(ripple);
  return { ripple, strength };
}

export async function createAquarium(canvas, settings, isCurrent = () => true) {
  const resources = aquariumResources();
  const textures = await loadAquariumTextures(resources,settings.quality);
  if (!isCurrent()) {
    resources.dispose();
    return null;
  }
  try {
    return buildAquarium(canvas,settings,resources,textures);
  } catch (error) {
    resources.dispose();
    throw error;
  }
}

function buildAquarium(canvas, settings, resources, textures) {
  const renderer = new THREE.WebGLRenderer({ canvas, powerPreference: 'low-power', alpha: false });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 1.10;
  const scene = new THREE.Scene();
  const flow = CURRENTS[settings.current];
  const depth = DEPTHS[settings.depth];
  const uniforms = { tankTime: { value: 0 }, tankLight: { value: .76 }, tankFlow: { value: flow },
    tankRockMap: { value: textures.rock }, tankSandMap: { value: textures.sand }, surfaceHeight: { value: depth.waterline } };
  const daylight = new THREE.Color(LIGHT_TONES[settings.lightTone]), moonlight = new THREE.Color('#86afeb'), evening = new THREE.Color('#ffd29b');
  const dayFloor = new THREE.Color('#92c2c6'), nightFloor = new THREE.Color('#567497');
  const water = WATERS[settings.water];
  const darkFog = new THREE.Color(water.dark), dayFog = new THREE.Color(water.deep);
  const backdrop = makeWaterBackdrop(scene,resources,uniforms,water);
  makeTankGlass(scene, resources, uniforms, settings.tank);
  makeWaterSurface(scene,resources,uniforms,depth.waterline);
  scene.fog = new THREE.FogExp2(dayFog,water.fog);
  const sky = new THREE.HemisphereLight('#d5f4ee','#607480',1.29);
  const sun=new THREE.DirectionalLight('#e5ffff',1.89);
  const rim=new THREE.DirectionalLight('#319eb7',.45);
  sun.position.set(-14.3,26.0,5.6);
  sun.target.position.set(2.0,0,-7.0);
  rim.position.set(5.1,3.0,-9.2);
  scene.add(sky,sun,sun.target,rim);

  const ratio = Math.max(1,canvas.clientWidth) / Math.max(1,canvas.clientHeight);
  const camera = new THREE.PerspectiveCamera(depth.lens,ratio,.12,110);
  camera.position.set(.22,depth.eye,EYE_Z);
  const target = new THREE.Vector3(.50,depth.aim,-5.2);
  camera.lookAt(target);
  const slope = Math.tan(THREE.MathUtils.degToRad(depth.lens / 2)) * ratio;
  const visibleWidth = (z) => Math.max(.7,(EYE_Z-z)*slope);
  const width = visibleWidth(0);
  const parallax = Math.min(.74,width*.052);
  configureShadows(renderer,sun,width,settings.quality);
  const habitat = makeHabitat(scene,resources,uniforms,settings,seededRandom(settings.seed),visibleWidth,textures);
  const vents = makeDecorations(scene,resources,uniforms,floorAt,width,settings.decorations,seededRandom(settings.seed ^ 72289),settings.quality);
  const food = createFoodSimulation({ random: seededRandom(settings.seed ^ 31071), floor: floorAt, flow });
  const animateFish = makeFish(scene,resources,uniforms,settings,seededRandom(settings.seed ^ 82717),width,habitat,food,visibleWidth);
  const animateInhabitants = makeInhabitants(scene,resources,uniforms,settings,seededRandom(settings.seed ^ 52773),width,habitat,food);
  const animateTurtles = makeTurtles(scene,resources,uniforms,settings,seededRandom(settings.seed ^ 8139),visibleWidth);
  const paintFood = makeFood(scene,resources,uniforms,food);
  const sizeParticles = makeWaterParticles(scene,resources,uniforms,seededRandom(settings.seed ^ 19753),settings,width,vents,floorAt);
  const { ripple, strength } = surfaceRipple(scene,resources);
  if (renderer.shadowMap.enabled) scene.traverse((node)=>{
    if (node.isMesh && node.material.isMeshStandardMaterial) node.receiveShadow=true;
  });
  const ray = new THREE.Raycaster();
  const tapPlane = new THREE.Plane(new THREE.Vector3(0,0,1),-1.68);
  const tap = { point:new THREE.Vector3(), strength:0 };
  const cursor = new THREE.Vector2();
  let lastWidth;
  let lastHeight;
  let lastPixelWidth;
  let elapsed = 0;
  let light = 1;
  let appearance = settings;

  function resize() {
    const w=canvas.clientWidth, h=canvas.clientHeight;
    if (!w || !h) return false;
    const pixelWidth=window.innerWidth*window.devicePixelRatio;
    if (w!==lastWidth || h!==lastHeight || pixelWidth!==lastPixelWidth) {
      lastWidth=w;
      lastHeight=h;
      lastPixelWidth=pixelWidth;
      const resolution=Math.min(pixelWidth/w,1.6,Math.sqrt(PIXEL_BUDGET[settings.quality]/(w*h)));
      const renderWidth=Math.round(w*resolution), renderHeight=Math.round(h*resolution);
      renderer.setSize(renderWidth,renderHeight,false);
      camera.aspect=w/h;
      camera.updateProjectionMatrix();
      backdrop.resize(camera.aspect,renderWidth,renderHeight);
      sizeParticles(h*resolution);
    }
    return true;
  }

  return {
    ratio,
    configure(value) { appearance = value; daylight.set(LIGHT_TONES[value.lightTone]); },
    isFeeding: food.active,
    setLight({ day, twilight, moon = .6 }) {
      const brightness = appearance.brightness / 100;
      light=day;
      uniforms.tankLight.value=.12+day*.88;
      sky.color.copy(moonlight).lerp(daylight,day).lerp(evening,twilight*.21);
      sky.groundColor.copy(nightFloor).lerp(dayFloor,day);
      sky.intensity=(.37 + moon*.17*(1-day) + day*1.28 + twilight*.31) * brightness;
      sun.color.copy(moonlight).lerp(daylight,day).lerp(evening,twilight*.70);
      sun.intensity=(.17 + moon*.19*(1-day) + day*2.21 + twilight*.58) * brightness;
      rim.intensity=.21+day*.41;
      scene.fog.color.copy(darkFog).lerp(dayFog,day);
      scene.fog.density=water.fog*(1.29-day*.12);
      backdrop.light(day,twilight);
    },
    feed(clientX, clientY) {
      const bounds=canvas.getBoundingClientRect();
      if (!bounds.width || !bounds.height) return false;
      cursor.set((clientX-bounds.left)/bounds.width*2-1,1-(clientY-bounds.top)/bounds.height*2);
      ray.setFromCamera(cursor,camera);
      const z = THREE.MathUtils.lerp(-9.2, 7.1, THREE.MathUtils.clamp((clientY-bounds.top)/bounds.height, .08, .92));
      tapPlane.constant=-z;
      if (!ray.ray.intersectPlane(tapPlane,tap.point)) return false;
      const x = THREE.MathUtils.clamp(tap.point.x, -visibleWidth(z)*.96, visibleWidth(z)*.96);
      if (!food.drop(x,z,depth.waterline,appearance.feedType,appearance.portion)) return false;
      tap.strength=1;
      ripple.position.copy(tap.point);
      ripple.quaternion.copy(camera.quaternion);
      return true;
    },
    draw(delta) {
      if (!resize()) return;
      elapsed+=delta;
      uniforms.tankTime.value=elapsed;
      tap.strength=Math.max(0,tap.strength-delta*1.26);
      ripple.visible=tap.strength>0;
      strength.value=tap.strength;
      const sway=Math.sin(elapsed*.102);
      camera.position.x=.22+sway*parallax;
      camera.position.y=depth.eye+Math.sin(elapsed*.16)*.10;
      target.x=.50+sway*parallax*.32;
      camera.lookAt(target);
      if (food.active()) food.step(delta);
      animateFish(delta,light);
      animateInhabitants(elapsed,delta,light);
      animateTurtles(elapsed,light);
      paintFood();
      renderer.render(scene,camera);
    },
    dispose() {
      scene.traverse((object) => { if (object.isInstancedMesh) object.dispose(); });
      resources.dispose();
      sun.shadow.dispose();
      renderer.dispose();
    },
  };
}
