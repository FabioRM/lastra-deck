import * as THREE from '../../node_modules/three/build/three.module.js';
import { makeRobot } from './deck-pet-cyber.mjs';

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

export function makeCompanion(model, scene, species) {
  if (species === 'robodog' || species === 'drone') return makeRobot(model, scene, species);
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
  return { root, body, head, eyes, ears, limbs, tail, mouth, blush, species };
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

export function poseCompanion(pet, time, motion, action, age, { sleeping, walking, arriving }) {
  const playing = action === 'play';
  const feeding = action === 'feed';
  const cuddling = action === 'pet';
  const jump = playing ? arc(age, .35, .97) * .55 + arc(age, 1.12, 1.70) * .34 : 0;
  const squish = playing ? pulse(age, .04, .26, .42) + pulse(age, .88, 1.0, 1.15) * .72
    + pulse(age, 1.56, 1.73, 1.92) * .57 : 0;
  const nuzzle = cuddling ? easeInOut(age, .06, .46) * (1 - easeInOut(age, 1.38, 2.28)) : 0;
  const interest = feeding ? pulse(age, .12, .55, .97) : playing ? pulse(age, .04, .69, 1.8) : 0;
  const chewing = feeding ? pulse(age, .76, 1.11, 1.87) * (.5 + .5 * Math.cos((age - .79) * 23)) : 0;
  const idle = motion ? Math.sin(time * 2.6) : 0;
  const attention = motion ? pulse(time % 12.6, 4.8, 5.7, 7.3) - pulse(time % 12.6, 8.5, 9.4, 10.4) : 0;
  const blinkTime = time % 5.35;
  const blink = motion ? Math.max(pulse(blinkTime, 3.72, 3.83, 3.97), .9 * pulse(blinkTime, 4.2, 4.29, 4.4)) : 0;
  const swing = motion ? Math.sin(time * 2.15) : 0;
  const step = motion ? Math.sin(time * 15) * walking : 0;
  const rinse = action === 'wash' ? pulse(age, .08, .58, 1.98) : 0;
  const stretch = action === 'wake' ? pulse(age, .02, .40, 1.08) : 0;
  const hover = pet.hover ? pet.hover + (motion ? Math.sin(time * 3.2) * .045 : 0) : 0;

  pet.root.position.set(.25 + (playing ? Math.sin(age * 5.2) * interest * .23 : 0),
    jump + hover + Math.abs(step) * .10 + arriving * .13, .57);
  pet.root.rotation.set(0, .33 + attention * .11 + (playing ? interest * Math.sin(age * 4) * .27 : 0), .055 * nuzzle);
  pet.body.scale.set(1 + squish * .135 - jump * .11, 1 + idle * .033 - .19 * squish + jump * .18 + .15 * stretch, 1 + squish * .115);
  pet.head.rotation.set(interest * (feeding ? .20 : -.18) + chewing * .105, attention * .22 - interest * .12,
    .042 * swing + nuzzle * (.28 + .035 * Math.sin(age * 6)) - squish * .085 + rinse * Math.sin(age * 16) * .13 - arriving * .18);
  pet.tail.rotation.set(swing * .065, swing * (.14 + nuzzle * .13) + jump * .42, .13 * nuzzle + .19 * jump);
  pet.mouth.scale.set(1 + chewing * .22, 1 + chewing * 1.7, 1);
  for (const eye of pet.eyes) eye.scale.y = 1 - Math.max(nuzzle * .86, blink * .93, chewing * .24);
  for (const cheek of pet.blush) cheek.scale.set(.087 + nuzzle * .028, .045 + nuzzle * .017, .025);
  for (const { rig, side, tilt } of pet.ears) {
    rig.rotation.x = .08 * swing + squish * .22 - jump * .5 + side * attention * .10;
    rig.rotation.z = tilt + side * (.036 * idle + jump * .22 + nuzzle * .12);
  }
  for (const { rig, side } of pet.limbs) {
    const flutter = playing ? Math.sin(age * (pet.species === 'penguin' ? 17 : 9) + side * .8) * jump * .28 : 0;
    rig.rotation.z = side * (.23 + jump * (pet.species === 'penguin' ? 1.95 : 1.45) + flutter - nuzzle * .12 + stretch * 1.05);
    rig.rotation.x = -.083 * idle - .53 * interest - .19 * chewing + side * step * .52;
  }
  if (sleeping) {
    pet.root.position.y = hover * .25;
    pet.root.rotation.z = .17;
    pet.body.scale.set(1.08, .72 + idle * .025, 1.07);
    pet.head.rotation.set(.29, -.10, .13);
    for (const eye of pet.eyes) eye.scale.y = .095;
  }
}
