const fullTurn = Math.PI * 2;

// Moving a paw, shifting the weight and following through are separate beats so clips blend
// cleanly into idle. The last frame is neutral unless it completes a full rotation.
export const CLIPS = {
  nuzzle: { effect: 'hearts', frames: [[0], [.38, { tilt: .34, eyes: .84, wag: .44 }], [1.23, { tilt: .26, eyes: .91, wag: .62 }], [2]] },
  wave: { effect: 'stars', frames: [[0], [.28, { paw: 1.48, tilt: -.22 }], [.49, { paw: .86, tilt: -.16 }], [.72, { paw: 1.57, tilt: -.22 }], [.93, { paw: 1.05 }], [1.34]] },
  twirl: { effect: 'ribbon', frames: [[0], [.20, { squash: .23, turn: -.26 }], [.58, { turn: 2.25, lift: .33, arms: .54 }], [1.05, { turn: 5.6, lift: .22, arms: .33 }], [1.44, { turn: fullTurn, squash: .16 }], [1.78, { turn: fullTurn }]] },
  flop: { effect: 'hearts', frames: [[0], [.28, { tilt: -.22, paw: .76 }], [.70, { lean: .89, squash: .39, eyes: .86, arms: .64, shift: .19 }], [1.36, { lean: .89, squash: .34, eyes: .88, arms: .4, shift: .19 }], [2.05]] },
  boing: { effect: 'stars', frames: [[0], [.17, { squash: .26 }], [.52, { lift: .61, arms: .87, pitch: -.24 }], [.83, { squash: .18 }], [1.08, { lift: .23, tilt: .22 }], [1.44]] },
  fetch: { effect: 'ball', frames: [[0], [.26, { squash: .16, yaw: -.38 }], [.64, { lift: .54, shift: -.32, arms: .70, turn: -.48 }], [1.02, { squash: .26 }], [1.36, { lift: .40, shift: .43, arms: .72, turn: .58 }], [1.71, { squash: .22 }], [2.13]] },
  pounce: { effect: 'dust', frames: [[0], [.36, { squash: .35, pitch: .24, shift: -.11, wag: .32 }], [.71, { lift: .46, shift: .43, arms: .83, pitch: -.22 }], [1.09, { shift: .60, pitch: .40, squash: .28 }], [1.55, { tilt: -.17 }], [1.92]] },
  dance: { effect: 'ribbon', frames: [[0], [.26, { lean: -.25, paw: 1.09, shift: -.28, lift: .12 }], [.55, { lean: .25, paw: -1.27, shift: .29, lift: .15 }], [.83, { lean: -.24, paw: 1.18, shift: -.27 }], [1.15, { lean: .27, paw: -1.44, shift: .28, lift: .26 }], [1.47, { arms: .88, lift: .42 }], [1.91]] },
  nibble: { effect: 'snack', frames: [[0], [.31, { pitch: .25, yaw: .24, paw: .53 }], [.84, { pitch: .33, chew: .67, eyes: .28, arms: .42 }], [1.4, { chew: 1, wag: .31 }], [2]] },
  toss: { effect: 'toss', frames: [[0], [.24, { squash: .19, pitch: .17 }], [.58, { pitch: -.36, open: .69, arms: .76, lift: .19 }], [1.02, { pitch: .10, chew: .78 }], [1.47, { chew: .50, eyes: .49 }], [1.91]] },
  sniff: { effect: 'sniff', frames: [[0], [.31, { pitch: .33, yaw: .30, chew: .29 }], [.55, { pitch: .19, yaw: -.18, tilt: .15 }], [.83, { pitch: .34, yaw: .18, chew: .61 }], [1.24, { eyes: .43, chew: .74, wag: .43 }], [1.75]] },
  rinse: { effect: 'bubbles', frames: [[0], [.26, { paws: .68, pitch: .30 }], [.68, { paw: 1.16, tilt: .14, eyes: .72 }], [1.10, { paw: -.96, tilt: -.14, eyes: .80 }], [1.62, { arms: .42, tilt: .12 }], [2.26]] },
  shake: { effect: 'splash', frames: [[0], [.23, { squash: .17, eyes: .30 }], [.57, { shake: 1, eyes: .81, arms: .35 }], [1.07, { shake: .92, eyes: .74, lift: .12 }], [1.49, { tilt: .21 }], [1.88]] },
  splash: { effect: 'splash', frames: [[0], [.30, { pitch: .35, paw: .52 }], [.62, { pitch: -.22, lift: .22, arms: .84 }], [.99, { pitch: .22, paw: -.74 }], [1.36, { pitch: -.16, lift: .18, arms: .54 }], [1.83]] },
  scrub: { effect: 'bubbles', frames: [[0], [.26, { tilt: .32, paw: 1.32, eyes: .33 }], [.56, { tilt: .35, paw: .85, eyes: .61 }], [.81, { tilt: -.30, paw: -1.30, eyes: .54 }], [1.12, { tilt: -.31, paw: -.7, eyes: .67 }], [1.75]] },
  curl: { effect: 'none', frames: [[0], [.27, { turn: -.39, tilt: .24 }], [.56, { squash: .22, eyes: .77 }], [1.08, { squash: .31, eyes: .9, lean: .19 }]] },
  loaf: { effect: 'none', frames: [[0], [.32, { lift: .12, pitch: -.21, arms: .31 }], [.67, { squash: .27, eyes: .68 }], [1.22, { squash: .31, eyes: .9, lean: .19 }]] },
  stretch: { effect: 'stars', frames: [[0], [.24, { squash: .18, eyes: .75 }], [.67, { squash: -.17, arms: 1.29, pitch: -.31, open: .58 }], [1.19, { tilt: -.31 }], [1.64]] },
  wakeHop: { effect: 'stars', frames: [[0], [.23, { eyes: .72, squash: .15 }], [.64, { lift: .37, arms: .74, open: .55 }], [.92, { squash: .21 }], [1.47]] },
  gaze: { effect: 'glints', frames: [[0], [.43, { pitch: -.30, tilt: .13, open: .35 }], [1.70, { pitch: -.19, open: .42 }], [2.47]] },
  shade: { effect: 'glints', frames: [[0], [.35, { paw: 1.53, pitch: -.18, eyes: .32 }], [1.53, { paw: 1.24, pitch: -.27, eyes: .46 }], [2.18]] },
  skyHop: { effect: 'stars', frames: [[0], [.29, { pitch: -.24, squash: .17 }], [.73, { lift: .46, paw: 1.4, pitch: -.43 }], [1.02, { squash: .22, pitch: -.14 }], [1.56, { pitch: -.21, tilt: .12 }], [2.25]] },
  inspect: { effect: 'none', frames: [[0], [.33, { pitch: .29, tilt: .22 }], [.68, { pitch: .12, tilt: -.29, yaw: .15 }], [1.2, { paw: .86, pitch: .22 }], [1.8]] },
  pawTap: { effect: 'dust', frames: [[0], [.32, { paw: .9, pitch: .29 }], [.51, { paw: .13, pitch: .37 }], [.72, { paw: 1.15, pitch: .17 }], [.92, { paw: .18, pitch: .23 }], [1.68]] },
  sip: { effect: 'none', frames: [[0], [.37, { pitch: .52, squash: .15, eyes: .25 }], [.74, { pitch: .44, chew: .65 }], [1.13, { pitch: .52, chew: .50 }], [1.55, { pitch: -.13, tilt: .20 }], [1.94]] },
  dig: { effect: 'dust', frames: [[0], [.32, { pitch: .39, paw: .86, squash: .12 }], [.55, { pitch: .34, paw: -.77 }], [.81, { pitch: .41, paw: 1.06 }], [1.08, { pitch: .26, paw: -.92 }], [1.40, { lift: .19, arms: .41, pitch: -.12 }], [1.87]] },
  yawn: { effect: 'none', frames: [[0], [.32, { squash: .13, eyes: .61 }], [.73, { pitch: -.30, open: .96, eyes: .90, arms: .21 }], [1.15, { squash: .21, eyes: .72 }], [1.79]] },
  rest: { effect: 'none', frames: [[0], [.47, { squash: .30, lean: .18, eyes: .80 }], [2.37, { squash: .36, lean: .23, eyes: .91 }], [3.02]] },
  listen: { effect: 'glints', frames: [[0], [.33, { tilt: -.34, yaw: .21 }], [.84, { tilt: .35, yaw: -.12 }], [1.17, { tilt: .29, pitch: -.12 }], [1.82]] },
};

const BUTTONS = {
  pet: ['nuzzle', 'wave', 'twirl', 'flop', 'boing'],
  play: ['fetch', 'pounce', 'dance', 'boing'],
  feed: ['nibble', 'toss', 'sniff'],
  wash: ['rinse', 'shake', 'scrub', 'splash'],
  sleep: ['curl', 'loaf'],
  wake: ['stretch', 'wakeHop', 'wave'],
  sky: ['gaze', 'shade', 'skyHop'],
};

export const FEATURE_CLIPS = {
  light: ['pawTap', 'listen', 'boing'],
  spark: ['inspect', 'pawTap', 'listen'],
  water: ['sip', 'splash', 'pawTap'],
  scan: ['inspect', 'wave', 'dance'],
  flower: ['sniff', 'listen', 'inspect'],
  shell: ['listen', 'pawTap', 'inspect'],
  snow: ['dig', 'boing', 'inspect'],
  rest: ['rest', 'yawn', 'stretch'],
};

export const clipLength = (name) => CLIPS[name]?.frames.at(-1)[0] ?? 0;
export const clipEffect = (name) => CLIPS[name]?.effect;

export function sampleClip(name, age) {
  const frames = CLIPS[name]?.frames;
  if (!frames || age <= 0 || age >= frames.at(-1)[0]) return {};
  const index = frames.findIndex(([at]) => at > age);
  const [start, left = {}] = frames[index - 1];
  const [end, right = {}] = frames[index];
  const t = (age - start) / (end - start);
  const eased = t * t * (3 - 2 * t);
  const pose = {};
  for (const field of new Set([...Object.keys(left), ...Object.keys(right)])) {
    const from = left[field] ?? 0;
    pose[field] = from + ((right[field] ?? 0) - from) * eased;
  }
  return pose;
}

export function shuffleClips(random = Math.random) {
  const bags = new Map();
  return (name, variants = BUTTONS[name]) => {
    if (!variants?.length) return undefined;
    const state = bags.get(name) ?? { queued: [], last: undefined };
    if (!state.queued.length) {
      state.queued = [...variants];
      for (let index = state.queued.length - 1; index > 0; index--) {
        const other = Math.floor(random() * (index + 1));
        [state.queued[index], state.queued[other]] = [state.queued[other], state.queued[index]];
      }
      if (state.queued.length > 1 && state.queued.at(-1) === state.last) {
        [state.queued[0], state.queued[state.queued.length - 1]] = [state.queued.at(-1), state.queued[0]];
      }
    }
    state.last = state.queued.pop();
    bags.set(name, state);
    return state.last;
  };
}

const NEED_ACTIVITIES = {
  fullness: ['sniff', 'sip'],
  joy: ['wave', 'nuzzle'],
  play: ['pounce', 'dance'],
  energy: ['yawn', 'rest'],
  hygiene: ['scrub', 'shake'],
};

export function chooseActivity(needs, previous, random = Math.random) {
  const urgent = Object.keys(NEED_ACTIVITIES)
    .filter((key) => needs?.[key] < 49)
    .sort((a, b) => needs[a] - needs[b]);
  const highest = urgent[0];
  const closeNeeds = highest ? urgent.filter((key) => needs[key] <= needs[highest] + 9) : [];
  const candidates = highest
    ? [...NEED_ACTIVITIES[highest], ...closeNeeds.flatMap((key) => NEED_ACTIVITIES[key]), 'visit', 'wander']
    : ['visit', 'visit', 'wander', 'pace', 'listen', 'stretch', 'boing'];
  const fresh = candidates.filter((value) => value !== previous);
  return fresh[Math.floor(random() * fresh.length)];
}
