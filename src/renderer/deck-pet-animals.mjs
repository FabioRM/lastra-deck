import * as THREE from '../../node_modules/three/build/three.module.js';
import { makeRobot } from './deck-pet-cyber.mjs';
import { emotionPose, sampleClip } from './deck-pet-behavior.mjs';

const ANIMALS = {
  fox: { coat: '#ee9553', cream: '#ffe5bb', paws: '#82534a', ears: 'pointed' },
  rabbit: { coat: '#e0bbea', cream: '#fff0eb', paws: '#ba84ca', ears: 'long' },
  cat: { coat: '#a8bce1', cream: '#edf2ff', paws: '#6e87b4', ears: 'pointed' },
  panda: { coat: '#c66a43', cream: '#ffe7c3', paws: '#603a3e', ears: 'round' },
  axolotl: { coat: '#f4abd0', cream: '#ffdfeb', paws: '#db83b6', ears: 'gills' },
  penguin: { coat: '#303f67', cream: '#fff2df', paws: '#eb9e5b', ears: 'none' },
};

function gills(model, rig, outer, inner) {
  const { mesh, link } = model;
  for (const [x, y, z] of [[.45, .53, -.11], [.53, .25, -.02], [.44, -.04, .015]]) {
    const middle = [x * .63, y * .55, z];
    link(rig, 'column', outer, [0, 0, 0], middle, .069);
    link(rig, 'column', outer, middle, [x, y, z], .048);
    mesh(rig, 'ball', outer, middle, [.071, .074, .074]);
    for (let tuft = 0; tuft < 3; tuft++) {
      const amount = .55 + tuft * .21;
      const plume = mesh(rig, 'ball', inner, [x * amount, y * amount + .06, z + .016], [.066, .155 - tuft * .016, .053]);
      plume.rotation.z = -.78 - y * .3;
    }
    mesh(rig, 'ball', '#ffd6e6', [x, y, z], [.056, .06, .055]);
  }
}

function earRig(model, head, side, palette) {
  const { coat, cream, paws, ears } = palette;
  const { group, mesh } = model;
  const rig = group(head, side * (ears === 'gills' ? .58 : .40), ears === 'gills' ? .23 : .56, -.096);
  rig.rotation.z = -side * (ears === 'long' ? .19 : .27);
  if (ears === 'gills') {
    rig.scale.x = side;
    gills(model, rig, paws, '#f79fc3');
  } else if (ears === 'long') {
    mesh(rig, 'ball', coat, [0, .29, 0], [.22, .49, .17]);
    mesh(rig, 'ball', '#ffb2c3', [0, .31, .12], [.122, .345, .076]);
  } else if (ears === 'round') {
    mesh(rig, 'ball', cream, [0, .12, -.005], [.228, .241, .15]);
    mesh(rig, 'ball', paws, [0, .13, .111], [.142, .156, .07]);
    mesh(rig, 'ball', '#f19a89', [0, .116, .159], [.087, .112, .026]);
  } else {
    mesh(rig, 'cone', coat, [0, .18, 0], [.24, .58, .176]);
    mesh(rig, 'cone', '#ffb4b7', [0, .15, .103], [.126, .35, .081]);
  }
  return { rig, side, tilt: rig.rotation.z };
}

function makeTail(model, body, species, { coat, cream, paws }) {
  const { group, mesh, geometry } = model;
  const tail = group(body, .27, .17, -.29);
  if (species === 'fox' || species === 'panda') {
    const puff = group(tail, .41, .21, -.12);
    puff.rotation.z = .38;
    mesh(puff, 'ball', coat, [.04, 0, 0], [.61, .245, .255]);
    if (species === 'panda') {
      for (const [x, width, height] of [[-.21, .12, .221], [.06, .14, .257], [.36, .127, .222]]) {
        mesh(puff, 'ball', '#925044', [x, 0, .002], [width, height, height * 1.09]);
      }
    }
    mesh(puff, 'ball', species === 'fox' ? cream : paws, [.445, 0, -.006], [.223, .174, .195]);
  } else if (species === 'rabbit') {
    mesh(tail, 'ball', cream, [-.49, .10, -.11], [.23, .23, .22]);
  } else if (species === 'axolotl') {
    const fin = group(tail, .34, .20, -.15);
    mesh(fin, 'ball', coat, [.25, .035, 0], [.53, .137, .153]).rotation.z = .31;
    mesh(fin, 'ball', paws, [.40, .172, -.011], [.44, .226, .067]).rotation.z = .39;
    mesh(fin, 'ball', '#ffe0ed', [.49, .17, .034], [.272, .054, .032]).rotation.z = .4;
  } else if (species === 'cat') {
    const curve = new THREE.CatmullRomCurve3([[0, 0, 0], [.40, .07, -.12], [.67, .38, -.13], [.66, .65, -.12],
      [.49, .68, -.09]].map((point) => new THREE.Vector3(...point)));
    mesh(tail, geometry('cat tail', () => new THREE.TubeGeometry(curve, 22, .092, 10)), coat, [0, 0, 0], [1, 1, 1]);
    mesh(tail, 'ball', paws, [.49, .68, -.09], [.097, .097, .097]);
  }
  return tail;
}

function makeAnimal(model, scene, species) {
  const { group, mesh, link } = model;
  const palette = ANIMALS[species];
  const { coat, cream, paws } = palette;
  const penguin = species === 'penguin';
  const axolotl = species === 'axolotl';
  const root = group(scene, .25, 0, .57);
  const body = group(root);
  mesh(body, 'ball', coat, [0, .54, -.11], [.47, .56, .415]);
  mesh(body, 'ball', cream, [0, .46, .21], [penguin ? .365 : .304, penguin ? .442 : .365, .226]);
  const head = group(body, 0, axolotl ? .93 : 1.03, .152);
  mesh(head, 'ball', coat, [0, .25, 0], [axolotl ? .68 : .631, .49, .531]);
  const eyes = [];
  const brows = [];
  const ears = [];
  const limbs = [];
  const blush = [];
  for (const side of [-1, 1]) {
    const foot = mesh(body, 'ball', paws, [side * .279, .128, .295], [.193, .125, .255]);
    foot.rotation.y = side * .11;
    const arm = group(body, side * .369, .63, .088);
    mesh(arm, 'ball', penguin || axolotl ? coat : paws, [0, -.215, .05],
      [penguin ? .121 : .135, penguin ? .323 : .233, axolotl ? .109 : .167]);
    if (!penguin && !axolotl) mesh(arm, 'ball', coat, [0, -.13, .003], [.141, .18, .147]);
    limbs.push({ rig: arm, side });
    if (palette.ears !== 'none') ears.push(earRig(model, head, side, palette));

    if (penguin || species === 'panda') {
      const patch = mesh(head, 'ball', cream, [side * .243, penguin ? .247 : .331, .378],
        [penguin ? .31 : .12, penguin ? .304 : .065, .141]);
      patch.rotation.z = side * .15;
    }
    if (species === 'fox' || species === 'panda') {
      mesh(head, 'ball', cream, [side * .372, .105, .319], [.207, .135, .198]).rotation.z = side * .33;
    }
    if (!penguin) mesh(head, 'ball', cream, [side * .144, .095, .366], [axolotl ? .29 : .258, .201, .197]);
    const eye = group(head, side * (axolotl ? .28 : .263), .292, penguin ? .50 : .470);
    const dark = '#241b2e';
    const iris = mesh(eye, 'ball', dark, [0, 0, 0], [.107, .135, .049]);
    iris.rotation.y = side * .17;
    mesh(eye, 'ball', '#fff8e9', [-.035, .046, .047], [.032, .035, .015], 'glow');
    mesh(eye, 'ball', '#e3c9f0', [.030, -.049, .042], [.015, .016, .01], 'glow');
    eyes.push(eye);
    brows.push(mesh(head, 'ball', paws, [side * (axolotl ? .28 : .263), .487, penguin ? .49 : .463],
      [.061, .015, .019]));
    const cheek = mesh(head, 'ball', '#e88b9c', [side * .39, .146, penguin ? .483 : .441], [.087, .045, .025]);
    cheek.rotation.y = side * .35;
    blush.push(cheek);
    if (species === 'cat') {
      for (const offset of [-1, 1]) {
        link(head, 'column', paws, [side * .41, .127, .46], [side * .61, .129 + offset * .058, .43], .011);
      }
    }
    if (axolotl) {
      for (let spot = 0; spot < 3; spot++) {
        const radius = .016 + spot * .006;
        mesh(head, 'ball', '#ffc3e2', [side * (.37 + spot * .06), .20 + spot * .046, .46 - spot * .041],
          [radius, radius, .015]);
      }
    }
  }
  const mouth = group(head, 0, .079, penguin ? .574 : .561);
  mesh(mouth, 'ball', penguin ? '#e28b52' : '#823f60', [0, 0, 0], [.064, .033, .023]);
  if (!axolotl) {
    mesh(head, 'ball', penguin ? '#ffc271' : '#4a2f40', [0, .156, penguin ? .561 : .565],
      penguin ? [.112, .078, .118] : [.078, .048, .047]);
    mesh(head, 'ball', penguin ? '#ffe5ae' : '#d2988f', [-.023, .177, penguin ? .647 : .602], [.021, .014, .012]);
  }
  if (species === 'cat') {
    for (const [x, size] of [[0, .115], [-.122, .075], [.122, .075]]) {
      mesh(head, 'ball', paws, [x, .596, .373], [.040, size, .026]).rotation.x = -.56;
    }
  }
  const tail = makeTail(model, body, species, palette);
  return { root, body, head, eyes, brows, ears, limbs, tail, mouth, blush, species };
}

export function makeCompanion(model, scene, species) {
  const mechanical = species === 'robodog' || species === 'drone';
  const pet = mechanical ? makeRobot(model, scene, species) : makeAnimal(model, scene, species);
  const stains = model.group(pet.body);
  const dirt = model.track(new THREE.MeshBasicMaterial({ color: mechanical ? '#5c535b' : '#624d46', transparent: true, depthWrite: false }));
  for (const [x, y, z, size] of [[-.24, .53, .358, .075], [-.18, .46, .411, .047], [.23, .51, .381, .059], [.19, .69, .37, .036]]) {
    const spot = model.mesh(stains, 'ball', dirt, [x, y, z], [size, size * .64, .028]);
    spot.rotation.set(-.14, x * 1.25, x * 3.15);
  }
  return { ...pet, stains, dirt };
}

const clamp = (number) => Math.min(1, Math.max(0, number));
const smooth = (number) => {
  const value = clamp(number);
  return value * value * (3 - 2 * value);
};
export const easeInOut = (age, start, end) => smooth((age - start) / (end - start));
export const pulse = (age, start, peak, end) => easeInOut(age, start, peak) * (1 - easeInOut(age, peak, end));
export function arc(age, start, end) {
  return age > start && age < end ? Math.sin((age - start) / (end - start) * Math.PI) : 0;
}

export function poseCompanion(pet, time, motion, clip, age, movement, needs, emotion) {
  const { sleeping, walking, turn, gaze, x, z } = movement;
  const { lift = 0, shift = 0, lean = 0, turn: spin = 0, squash = 0, pitch = 0, yaw = 0, tilt = 0,
    chew = 0, open = 0, eyes = 0, wag = 0, paw = 0, paws = 0, arms = 0, shake = 0 } = sampleClip(clip, age);
  const { wag: feelingWag = 0, cheeks = 0, lid = 0, smile = 0, perk = 0, droop = 0, bounce = 0,
    brow = 0, pitch: feelingPitch = 0, tilt: feelingTilt = 0, open: feelingOpen = 0 } = emotionPose(emotion, clip, age, time);
  const tired = Math.max(clamp((59 - (needs?.energy ?? 80)) / 45), clamp((53 - (needs?.health ?? 100)) / 53));
  const lowMood = clamp((51 - (needs?.joy ?? 88)) / 38);
  const hungry = clamp((53 - (needs?.fullness ?? 84)) / 38);
  const dirty = clamp((52 - (needs?.hygiene ?? 90)) / 36);
  const relaxed = 1 - tired * .47;
  const idle = motion ? Math.sin(time * (2.6 - tired * 1.1)) : 0;
  const tailWag = motion ? Math.sin(time * (2.15 + 4 * (wag + feelingWag)) + shift) : 0;
  const blinkTime = time % (5.35 - tired * 1.1);
  const blink = motion ? pulse(blinkTime, 2.34, 2.42, 2.57 + tired * .24) : 0;
  const stride = pet.hover ? 9 : pet.species === 'rabbit' ? 12 : 15;
  const step = motion ? Math.sin(time * stride * relaxed) * walking : 0;
  const bob = pet.hover ? .038 : pet.species === 'rabbit' ? .17 : .098;
  const hover = pet.hover ? pet.hover + idle * .041 : 0;
  const vibration = motion ? Math.sin(age * 29) * shake : 0;
  const sniff = motion && !clip ? Math.sin(time * 9) * pulse(time % 4.5, 1.93, 2.23, 2.55) * hungry : 0;
  const mouth = Math.max(open, feelingOpen, chew * (.56 + Math.sin(age * 23) * .44));
  const direction = turn ?? 0;
  let faceAngle = .33 + direction;
  let gazeYaw = 0;
  let gazePitch = 0;
  if (gaze) {
    const dx = gaze.x - x;
    const dz = gaze.z - z;
    const offset = THREE.MathUtils.euclideanModulo(Math.atan2(dx, dz) - faceAngle + Math.PI, Math.PI * 2) - Math.PI;
    const turnTo = THREE.MathUtils.clamp(offset, -.91, .91);
    faceAngle += turnTo * gaze.weight;
    gazeYaw = THREE.MathUtils.clamp(offset - turnTo, -.62, .62) * gaze.weight;
    const angle = Math.atan2(gaze.y - 1.22, Math.max(.2, Math.hypot(dx, dz)));
    gazePitch = THREE.MathUtils.clamp(-angle - (gaze.sky ? .31 : 0), -.60, .39) * gaze.weight;
  }

  pet.root.position.set(x + shift * .67, lift + hover + Math.abs(step) * bob + Math.abs(lean) * .11
    + Math.max(0, idle) * bounce * (1 - walking), z - Math.abs(shift) * .12);
  pet.root.rotation.set(0, faceAngle + spin, lean + step * .047);
  pet.body.scale.set(1 + squash * .29 - lift * .08, 1 + idle * .028 - squash + lift * .13 - tired * .075, 1 + squash * .22);
  pet.head.rotation.set(pitch + gazePitch + feelingPitch + (tired * .10 + lowMood * .06) + step * .053 + sniff * .13,
    yaw + gazeYaw + vibration * .24, tilt + feelingTilt + .032 * tailWag + vibration * .16);
  pet.tail.rotation.set(tailWag * .055 - lowMood * .16, tailWag * (.14 + (wag + feelingWag) * .42) * relaxed + lift * .42, lean * .27 + lift * .20);
  pet.mouth.scale.set(1 + mouth * .11 + smile, 1 + mouth * 2.3 - smile * .50, 1);
  pet.stains.visible = dirty > .03;
  pet.dirt.opacity = dirty * .49;
  for (const [index, eye] of pet.eyes.entries()) {
    const side = index === 0 ? -1 : 1;
    eye.scale.y = Math.max(.065, 1 - Math.max(eyes, blink * .94, lid + tired * .15 + lowMood * .07));
    eye.rotation.z = side * (brow * .43 + (sleeping ? .08 : 0));
    if (pet.brows) {
      pet.brows[index].rotation.z = side * brow;
      pet.brows[index].position.y = .474 + perk * .15 - droop * .045;
    }
  }
  pet.faceLight?.color.set(ROBOT_EMOTION_INK[emotion] ?? pet.faceColor);
  for (const cheek of pet.blush) cheek.scale.set(.087 + (wag + cheeks) * .033, .045 + (wag + cheeks) * .023, .025);
  for (const ear of pet.ears) {
    ear.rig.rotation.x = .12 * step + squash * .41 - lift * .43 + tired * .16 + droop * .39 - perk * .34 + vibration * .28;
    ear.rig.rotation.z = ear.tilt + ear.side * (.039 * idle + lift * .23 + tired * .125 + droop * .35 - perk * .29);
  }
  for (const { rig, side } of pet.limbs) {
    const wave = Math.max(0, paw * side);
    rig.rotation.z = side * (.23 + (lift * (pet.species === 'penguin' ? 1.4 : 1.1)) + arms * .83 + wave * .53);
    rig.rotation.x = side * step * .56 - wave * .95 - paws * .57 - arms * .44;
  }
  if (sleeping) {
    const settled = clip === 'loaf' || clip === 'curl' ? easeInOut(age, .07, clip === 'curl' ? .83 : 1.03) : 1;
    pet.root.position.y *= 1 - settled * .75;
    pet.root.rotation.z += (.17 - lean) * settled;
    pet.body.scale.y += (.72 + idle * .025 - pet.body.scale.y) * settled;
    pet.head.rotation.x += (.29 - pet.head.rotation.x) * settled;
    for (const eye of pet.eyes) eye.scale.y += (.095 - eye.scale.y) * settled;
  }
}

const ROBOT_EMOTION_INK = {
  affectionate: '#ff9fda', joyful: '#a6fff4', curious: '#b9a6ff', surprised: '#b6ecff',
  sleepy: '#9ba9ec', sleeping: '#889bdb', lonely: '#91b8fc', hungry: '#ffd58f',
  bored: '#baacda', uncomfortable: '#f6a795', unwell: '#e2b0a2', relaxed: '#a2ffc7',
};
