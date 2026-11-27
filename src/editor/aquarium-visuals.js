'use strict';

{
  // The tiles are rendered from Lastra's 3D models and stored in this order.
  const decorationTiles = [
    'arch', 'wreck', 'ruins', 'driftwood', 'vent', 'sponge', 'boulders', 'jar',
    'kelpPatch', 'redAlgae', 'tubeSponges', 'fanSponge', 'musselBed', 'coralThicket',
  ];
  const atlases = {
    presets: [4, 2, ['reef', 'forest', 'river', 'atoll', 'wreck', 'riverbank', 'pond']],
    decorations: [4, 4, decorationTiles],
    footprints: [4, 4, decorationTiles],
    species: [8, 7, [
      'clown', 'tang', 'anthias', 'cardinal', 'sardine', 'rockfish', 'ray', 'tetra', 'discus', 'cory',
      'blackClown', 'yellowTang', 'regal', 'mandarin', 'gramma', 'flame', 'butterfly', 'moorish',
      'guppy', 'betta', 'rummy', 'goldfish', 'angel', 'koi', 'cleaner', 'cherry', 'hermit', 'kelpCrab',
      'pistol', 'blueShrimp', 'porcelain', 'emerald', 'lobster', 'crayfish', 'pomPom', 'star', 'urchin',
      'jelly', 'nerite', 'turbo', 'conch', 'cowrie', 'nudibranch', 'clam', 'scallop', 'octopus',
      'cuttlefish', 'mussel', 'oyster', 'greenTurtle', 'hawksbill', 'cucumber', 'featherStar',
    ]],
    samples: [4, 4, ['rocks', 'plants', 'algaeDensity', 'coralDensity', 'spongeDensity', 'bubbleDensity', 'brightness', 'portion']],
    nightSamples: [2, 2, ['nightBrightness', 'glowIntensity']],
  };

  function show(tile, id, variant = 0) {
    const [columns, rows, keys] = atlases[tile.dataset.atlas];
    const index = keys.indexOf(id);
    tile.hidden = index < 0;
    if (index < 0) return;
    const slot = ['samples', 'nightSamples'].includes(tile.dataset.atlas) ? index * 2 + variant : index;
    tile.style.backgroundSize = `${columns * 100}% ${rows * 100}%`;
    tile.style.backgroundPosition = `${slot % columns / (columns - 1) * 100}% ${Math.floor(slot / columns) / (rows - 1) * 100}%`;
  }

  function picture(atlas, id, variant) {
    const tile = document.createElement('span');
    tile.className = 'aquarium-artwork';
    tile.dataset.atlas = atlas;
    tile.setAttribute('aria-hidden', 'true');
    show(tile, id, variant);
    return tile;
  }

  function rangeSample(input, atlas = 'samples') {
    const sample = document.createElement('span');
    sample.className = 'aquarium-range-sample';
    sample.setAttribute('aria-hidden', 'true');
    sample.append(picture(atlas, input.name), picture(atlas, input.name, 1));
    input.before(sample);
    if (input.name === 'bubbleDensity' || input.name === 'portion') {
      return particleSample(input, sample);
    }
    return () => {
      const fraction = (input.valueAsNumber - Number(input.min)) / (Number(input.max) - Number(input.min));
      sample.style.setProperty('--sample-strength', String(fraction));
    };
  }

  function particleSample(input, sample) {
    const isFood = input.name === 'portion';
    const particles = Array.from({ length: 18 }, (_, index) => {
      const particle = document.createElement('span');
      particle.className = 'aquarium-sample-particle';
      const x = (index * 43 + 17) % 89;
      const y = (index * 61 + 9) % 71;
      particle.style.left = `${isFood ? 24 + x * .59 : x + 5}%`;
      particle.style.top = `${isFood ? 12 + y * .76 : y + 7}%`;
      particle.style.setProperty('--particle-size', `${4 + index % 5}px`);
      return particle;
    });
    sample.append(...particles);
    return () => {
      const enabled = input.form.elements.namedItem(isFood ? 'touch' : 'bubbles').checked;
      const amount = enabled ? input.valueAsNumber : 0;
      const count = isFood ? amount * 6 : Math.round(amount * .18);
      const fraction = isFood ? Math.max(0, (amount - 1) / 2) : amount / 100;
      sample.style.setProperty('--sample-strength', String(fraction));
      sample.dataset.particles = isFood ? input.form.elements.namedItem('feedType').value : 'bubbles';
      for (const [index, particle] of particles.entries()) particle.hidden = index >= count;
    };
  }

  window.LastraAquariumVisuals = Object.freeze({ show, picture, rangeSample });
}
