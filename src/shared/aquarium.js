'use strict';

{
  const SPECIES = {
    clown: { label: 'Clownfish', group: 'fish', max: 6 },
    tang: { label: 'Blue tang', group: 'fish', max: 5 },
    anthias: { label: 'Lyretail anthias', group: 'fish', max: 16 },
    cardinal: { label: 'Banggai cardinalfish', group: 'fish', max: 8 },
    sardine: { label: 'Pacific sardine', group: 'fish', max: 18 },
    rockfish: { label: 'Kelp rockfish', group: 'fish', max: 6 },
    ray: { label: 'Blue-spotted ray', group: 'fish', max: 3 },
    tetra: { label: 'Neon tetra', group: 'fish', max: 18 },
    discus: { label: 'Red discus', group: 'fish', max: 6 },
    cory: { label: 'Bronze cory', group: 'fish', max: 8 },
    blackClown: { label: 'Black ocellaris', group: 'fish', max: 5 },
    yellowTang: { label: 'Yellow tang', group: 'fish', max: 5 },
    regal: { label: 'Regal angelfish', group: 'fish', max: 4 },
    mandarin: { label: 'Mandarin dragonet', group: 'fish', max: 5 },
    gramma: { label: 'Royal gramma', group: 'fish', max: 6 },
    flame: { label: 'Flame angelfish', group: 'fish', max: 4 },
    butterfly: { label: 'Copperband butterflyfish', group: 'fish', max: 5 },
    moorish: { label: 'Moorish idol', group: 'fish', max: 4 },
    guppy: { label: 'Fancy guppy', group: 'fish', max: 12 },
    betta: { label: 'Betta', group: 'fish', max: 3 },
    rummy: { label: 'Rummy-nose tetra', group: 'fish', max: 18 },
    goldfish: { label: 'Fantail goldfish', group: 'fish', max: 7 },
    angel: { label: 'Freshwater angelfish', group: 'fish', max: 6 },
    koi: { label: 'Kohaku koi', group: 'fish', max: 6 },
    cleaner: { label: 'Cleaner shrimp', group: 'crustaceans', max: 5 },
    cherry: { label: 'Cherry shrimp', group: 'crustaceans', max: 7 },
    hermit: { label: 'Hermit crab', group: 'crustaceans', max: 4 },
    kelpCrab: { label: 'Kelp crab', group: 'crustaceans', max: 4 },
    pistol: { label: 'Pistol shrimp', group: 'crustaceans', max: 5 },
    blueShrimp: { label: 'Blue velvet shrimp', group: 'crustaceans', max: 7 },
    porcelain: { label: 'Porcelain crab', group: 'crustaceans', max: 4 },
    emerald: { label: 'Emerald crab', group: 'crustaceans', max: 5 },
    lobster: { label: 'Reef lobster', group: 'crustaceans', max: 3 },
    crayfish: { label: 'Electric blue crayfish', group: 'crustaceans', max: 4 },
    pomPom: { label: 'Pom-pom crab', group: 'crustaceans', max: 4 },
    star: { label: 'Sea star', group: 'invertebrates', max: 5 },
    urchin: { label: 'Purple sea urchin', group: 'invertebrates', max: 4 },
    jelly: { label: 'Moon jelly', group: 'invertebrates', max: 5 },
    nerite: { label: 'Nerite snail', group: 'molluscs', max: 5 },
    turbo: { label: 'Turbo snail', group: 'molluscs', max: 5 },
    conch: { label: 'Fighting conch', group: 'molluscs', max: 4 },
    cowrie: { label: 'Tiger cowrie', group: 'molluscs', max: 4 },
    nudibranch: { label: 'Blue nudibranch', group: 'molluscs', max: 6 },
    clam: { label: 'Giant clam', group: 'molluscs', max: 4 },
    scallop: { label: 'Flame scallop', group: 'molluscs', max: 4 },
    octopus: { label: 'Reef octopus', group: 'molluscs', max: 2 },
    cuttlefish: { label: 'Common cuttlefish', group: 'molluscs', max: 3 },
    mussel: { label: 'Blue mussel', group: 'molluscs', max: 9 },
    oyster: { label: 'Rock oyster', group: 'molluscs', max: 7 },
    greenTurtle: { label: 'Green sea turtle', group: 'reptiles', max: 2 },
    hawksbill: { label: 'Hawksbill sea turtle', group: 'reptiles', max: 2 },
    cucumber: { label: 'Sea cucumber', group: 'invertebrates', max: 5 },
    featherStar: { label: 'Feather star', group: 'invertebrates', max: 4 },
  };

  const DECORATIONS = {
    arch: 'Limestone arch', wreck: 'Sunken boat', ruins: 'Stone ruins', driftwood: 'Branching driftwood',
    vent: 'Bubble vent', sponge: 'Barrel sponges', boulders: 'Basalt pillars', jar: 'Ceramic shelter',
    kelpPatch: 'Kelp cluster', redAlgae: 'Red algae cluster', tubeSponges: 'Tube sponge colony',
    fanSponge: 'Fan sponge colony', musselBed: 'Mussel bed', coralThicket: 'Coral thicket',
  };
  const DECORATION_LIMIT = 8;
  const PRESETS = {
    reef: { label: 'Coral reef', layout: 'lagoon', substrate: 'aragonite', growth: 'corals', water: 'clear',
      algae: 'mixed', algaeDensity: 57, coralDensity: 83, spongeDensity: 39,
      stock: { clown: 4, tang: 3, anthias: 11, cardinal: 4, cleaner: 2, hermit: 2, star: 3, urchin: 2, greenTurtle: 1, mussel: 3 } },
    forest: { label: 'Kelp forest', layout: 'canyon', substrate: 'basalt', growth: 'kelp', water: 'coastal',
      algae: 'kelp', algaeDensity: 70, coralDensity: 9, spongeDensity: 25,
      stock: { sardine: 14, rockfish: 4, kelpCrab: 3, ray: 1, star: 3, urchin: 2, jelly: 3, mussel: 5, oyster: 2 } },
    river: { label: 'Flooded forest', layout: 'roots', substrate: 'gravel', growth: 'riverPlants', water: 'tannin',
      algae: 'green', algaeDensity: 25, coralDensity: 0, spongeDensity: 0,
      stock: { tetra: 15, discus: 4, cory: 5, cherry: 5, nerite: 3 } },
    atoll: { label: 'Turquoise atoll', layout: 'shelf', substrate: 'pink', growth: 'coralGarden', water: 'lagoon',
      algae: 'mixed', algaeDensity: 64, coralDensity: 94, spongeDensity: 53,
      decorations: [{ type: 'arch', x: 30, depth: 65, size: 122 }],
      stock: { blackClown: 4, yellowTang: 3, regal: 3, mandarin: 3, gramma: 5, butterfly: 4, porcelain: 2,
        pistol: 2, pomPom: 2, clam: 2, conch: 2, turbo: 2, nudibranch: 3, featherStar: 2, hawksbill: 1, oyster: 4 } },
    wreck: { label: 'Sunken wreck', layout: 'canyon', substrate: 'basalt', growth: 'meadow', water: 'coastal',
      algae: 'red', algaeDensity: 62, coralDensity: 33, spongeDensity: 48,
      decorations: [{ type: 'wreck', x: -12, depth: 63, size: 155, rotation: 16 }, { type: 'vent', x: 57, depth: 54 }],
      stock: { sardine: 15, ray: 2, flame: 3, moorish: 3, lobster: 2, emerald: 3, octopus: 1, cuttlefish: 2,
        cowrie: 2, scallop: 3, cucumber: 2, jelly: 2, mussel: 5, greenTurtle: 1 } },
    riverbank: { label: 'Planted riverbank', layout: 'bank', substrate: 'silt', growth: 'plantedGarden', water: 'clear',
      algae: 'green', algaeDensity: 34, coralDensity: 0, spongeDensity: 0,
      decorations: [{ type: 'driftwood', x: -54, depth: 59, size: 135 }, { type: 'jar', x: 40, depth: 33, rotation: -19 }],
      stock: { rummy: 12, guppy: 8, betta: 2, angel: 4, cory: 5, blueShrimp: 4, crayfish: 2, nerite: 3 } },
    pond: { label: 'Koi garden', layout: 'open', substrate: 'pink', growth: 'meadow', water: 'lagoon',
      algae: 'green', algaeDensity: 28, coralDensity: 0, spongeDensity: 0,
      decorations: [{ type: 'ruins', x: 49, depth: 71 }, { type: 'boulders', x: -60, depth: 53 }],
      stock: { koi: 5, goldfish: 7, guppy: 7, cherry: 5, blueShrimp: 5, nerite: 3 } },
  };
  const CHOICES = {
    layout: { lagoon: 'Reef islands', canyon: 'Rock canyon', roots: 'Driftwood roots', open: 'Open water',
      shelf: 'Reef terraces', bank: 'Asymmetric riverbank' },
    substrate: { aragonite: 'Pale sand', basalt: 'Volcanic sand', gravel: 'River gravel', pink: 'Pink coral sand', silt: 'Dark planted soil' },
    growth: { corals: 'Corals and anemones', kelp: 'Giant kelp', riverPlants: 'River plants', sparse: 'Sparse vegetation',
      coralGarden: 'Dense coral garden', meadow: 'Seagrass meadow', plantedGarden: 'Broad-leaf garden',
      mixedPlants: 'Mixed underwater plants', eelgrass: 'Eelgrass beds', stemGarden: 'Layered stem plants' },
    algae: { mixed: 'Mixed seaweeds', kelp: 'Kelp ribbons', red: 'Red algae', green: 'Sea lettuce and green algae' },
    coralStyle: { mixed: 'Mixed coral colonies', branching: 'Branching corals', plates: 'Plate and brain corals', soft: 'Sea fans and soft corals' },
    spongeStyle: { mixed: 'Mixed sponge colonies', tube: 'Tube sponges', barrel: 'Barrel sponges', fan: 'Fan sponges' },
    rockStyle: { mixed: 'Mixed rock formations', coastal: 'Coastal boulders', limestone: 'Eroded limestone',
      basalt: 'Fractured basalt', slate: 'Layered slate' },
    bubblePattern: { mixed: 'Natural bubbles and vents', scattered: 'Scattered bubbles', columns: 'Bubble columns', vents: 'Only placed vents' },
    turtleVisits: { occasional: 'Occasional passes', frequent: 'Frequent passes', resident: 'Always in the tank' },
    water: { clear: 'Ocean blue', coastal: 'Coastal green', tannin: 'Amber blackwater', lagoon: 'Turquoise shallows', abyss: 'Deep indigo' },
    tank: { panorama: 'Open panorama', rimless: 'Rimless glass', cabinet: 'Dark frame' },
    depth: { shallow: 'Shallow tank', standard: 'Standard depth', deep: 'Deep tank' },
    current: { calm: 'Still water', gentle: 'Gentle current', strong: 'Strong current' },
    lightTone: { neutral: 'Natural daylight', warm: 'Golden light', blue: 'Blue reef light' },
    feedType: { flakes: 'Floating flakes', pellets: 'Slow-sinking pellets', wafers: 'Bottom wafers' },
    lighting: { solar: 'Follow the sun', schedule: 'Local schedule' },
    motion: { natural: 'Natural movement', gentle: 'Gentle movement', still: 'Still scene' },
    quality: { eco: 'Economy', balanced: 'Balanced', high: 'High detail' },
  };
  const STOCK_LIMIT = 68;
  const NEW_INHABITANTS = ['mussel','oyster','greenTurtle','hawksbill'];
  const validTime = (value) => typeof value === 'string' && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);
  const choose = (values, value, fallback) => typeof value === 'string' && Object.hasOwn(values, value) ? value : fallback;
  const stockCount = (value, max) => Number.isInteger(value) ? Math.min(max, Math.max(0, value)) : 0;
  const bounded = (value, min, max, fallback) => Number.isFinite(value) ? Math.round(Math.min(max, Math.max(min, value))) : fallback;

  function normalizeDecorations(input) {
    if (!Array.isArray(input)) return [];
    return input.slice(0, DECORATION_LIMIT).flatMap((item) => {
      if (!item || typeof item.type !== 'string' || !Object.hasOwn(DECORATIONS, item.type)) return [];
      return [{ type: item.type, x: bounded(item.x, -100, 100, 0), depth: bounded(item.depth, 0, 100, 50),
        size: bounded(item.size, 45, 200, 100), rotation: bounded(item.rotation, -180, 180, 0) }];
    });
  }

  function normalizeAquarium(input) {
    const value = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
    const preset = choose(PRESETS, value.preset, 'reef');
    const source = PRESETS[preset];
    const counts = value.stock && typeof value.stock === 'object' && !Array.isArray(value.stock) ? value.stock : source.stock;
    // Add the new residents to older untouched presets and preserve explicit stocking choices.
    const legacyPreset = counts !== source.stock && NEW_INHABITANTS.every((id)=>!Object.hasOwn(counts,id))
      && Object.keys(SPECIES).filter((id)=>!NEW_INHABITANTS.includes(id))
        .every((id)=>(Object.hasOwn(counts,id) ? counts[id] : 0)===(source.stock[id] ?? 0));
    let remaining = STOCK_LIMIT;
    const stock = {};
    for (const [id, species] of Object.entries(SPECIES)) {
      const wanted=Object.hasOwn(counts,id) ? counts[id] : legacyPreset && NEW_INHABITANTS.includes(id) ? source.stock[id] : 0;
      const count=Math.min(remaining,stockCount(wanted,species.max));
      stock[id] = count;
      remaining -= count;
    }
    const dawn = validTime(value.dawn) ? value.dawn : '07:00';
    const dusk = validTime(value.dusk) ? value.dusk : '19:00';
    const growth = choose(CHOICES.growth, value.growth, source.growth);
    const coralDefault = growth===source.growth ? source.coralDensity : growth==='corals' ? 83 : growth==='coralGarden' ? 94 : 0;
    return {
      enabled: value.enabled !== false, preset, stock,
      layout: choose(CHOICES.layout, value.layout, source.layout),
      substrate: choose(CHOICES.substrate, value.substrate, source.substrate),
      growth,
      water: choose(CHOICES.water, value.water, source.water),
      tank: choose(CHOICES.tank, value.tank, 'panorama'),
      depth: choose(CHOICES.depth, value.depth, 'standard'),
      current: choose(CHOICES.current, value.current, 'gentle'),
      algae: choose(CHOICES.algae, value.algae, source.algae),
      coralStyle: choose(CHOICES.coralStyle, value.coralStyle, 'mixed'),
      spongeStyle: choose(CHOICES.spongeStyle, value.spongeStyle, 'mixed'),
      rockStyle: choose(CHOICES.rockStyle, value.rockStyle, 'mixed'),
      bubblePattern: choose(CHOICES.bubblePattern, value.bubblePattern, 'mixed'),
      turtleVisits: choose(CHOICES.turtleVisits, value.turtleVisits, 'occasional'),
      lightTone: choose(CHOICES.lightTone, value.lightTone, 'neutral'),
      feedType: choose(CHOICES.feedType, value.feedType, 'flakes'),
      rocks: bounded(value.rocks, 0, 100, 58),
      plants: bounded(value.plants, 0, 100, 67),
      algaeDensity: bounded(value.algaeDensity, 0, 100, source.algaeDensity),
      coralDensity: bounded(value.coralDensity, 0, 100, coralDefault),
      spongeDensity: bounded(value.spongeDensity, 0, 100, source.spongeDensity),
      bubbleDensity: bounded(value.bubbleDensity, 0, 100, 41),
      brightness: bounded(value.brightness, 35, 145, 100),
      portion: bounded(value.portion, 1, 3, 2),
      decorations: normalizeDecorations(value.decorations ?? source.decorations),
      lighting: choose(CHOICES.lighting, value.lighting, 'solar'),
      motion: choose(CHOICES.motion, value.motion, 'natural'),
      quality: choose(CHOICES.quality, value.quality, 'balanced'),
      dawn: dawn === dusk ? '07:00' : dawn, dusk: dawn === dusk ? '19:00' : dusk,
      bubbles: value.bubbles !== false, touch: value.touch !== false,
      seed: Number.isSafeInteger(value.seed) && value.seed >= 0 ? value.seed % 0x1_0000_0000 : 24437,
    };
  }

  function applyAquariumPreset(current, preset) {
    if (!Object.hasOwn(PRESETS, preset)) return normalizeAquarium(current);
    const { layout, substrate, growth, water, stock, algae, algaeDensity, coralDensity, spongeDensity, decorations = [] } = PRESETS[preset];
    return normalizeAquarium({ ...current, preset, layout, substrate, growth, water, stock, algae, algaeDensity,
      coralDensity, spongeDensity, decorations });
  }

  const wrap = (minutes) => ((minutes % 1440) + 1440) % 1440;
  const minutesOf = (time) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3));
  function smooth(from, to, value) {
    const x = Math.min(1, Math.max(0, (value - from) / (to - from)));
    return x * x * (3 - 2 * x);
  }

  function solarElevation(date, latitude, longitude) {
    // NOAA general solar-position equations, with time and annual phase expressed in UTC.
    // https://gml.noaa.gov/grad/solcalc/solareqns.PDF
    const rad = Math.PI / 180;
    const year = date.getUTCFullYear();
    const begin = Date.UTC(year, 0, 1);
    const fraction = 2 * Math.PI * (date.getTime() - begin - 43_200_000) / (Date.UTC(year + 1, 0, 1) - begin);
    const c = Math.cos(fraction), s = Math.sin(fraction), c2 = Math.cos(2 * fraction), s2 = Math.sin(2 * fraction);
    const equation = 229.18 * (.000075 + .001868 * c - .032077 * s - .014615 * c2 - .040849 * s2);
    const declination = .006918 - .399912 * c + .070257 * s - .006758 * c2 + .000907 * s2
      - .002697 * Math.cos(3 * fraction) + .00148 * Math.sin(3 * fraction);
    const minutes = date.getUTCHours() * 60 + date.getUTCMinutes() + date.getUTCSeconds() / 60;
    const hourAngle = (wrap(minutes + equation + 4 * longitude) / 4 - 180) * rad;
    const lat = latitude * rad;
    const sine = Math.sin(lat) * Math.sin(declination) + Math.cos(lat) * Math.cos(declination) * Math.cos(hourAngle);
    return Math.asin(Math.min(1, Math.max(-1, sine))) / rad;
  }

  function aquariumLight(settings, date, location) {
    const { latitude, longitude } = location ?? {};
    let elevation;
    if (settings.lighting === 'solar' && Number.isFinite(latitude) && Math.abs(latitude) <= 90
      && Number.isFinite(longitude) && Math.abs(longitude) <= 180) {
      elevation = solarElevation(date, latitude, longitude);
    } else {
      const elapsed = wrap(date.getHours() * 60 + date.getMinutes() + date.getSeconds() / 60 - minutesOf(settings.dawn));
      const length = wrap(minutesOf(settings.dusk) - minutesOf(settings.dawn));
      if (elapsed < length) elevation = 52 * Math.sin(Math.PI * elapsed / length);
      else elevation = -46 * Math.sin(Math.PI * (elapsed - length) / (1440 - length));
    }
    return { day: smooth(-6, 23, elevation), twilight: smooth(-11, -2, elevation) * (1 - smooth(1, 19, elevation)) };
  }

  const aquarium = { SPECIES, PRESETS, CHOICES, DECORATIONS, DECORATION_LIMIT, STOCK_LIMIT,
    normalizeAquarium, applyAquariumPreset, aquariumLight, solarElevation };
  if (typeof module === 'object') module.exports = aquarium;
  else window.LastraAquariumSettings = aquarium;
}
