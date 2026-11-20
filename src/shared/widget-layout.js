'use strict';

{
  const { DEFAULT_CHOICES } = typeof module === 'object' ? require('./decisions') : window.LastraDecisions;
  const MAX_WIDGETS = 12;
  const BAR_GRID = Object.freeze({ cols: 6, rows: 1 });
  const VIEW_GRID = Object.freeze({ cols: 4, rows: 4 });
  const mediaFields = {
    appearance: { label: 'Appearance', value: 'compact', choices: { compact: 'Compact', expanded: 'Expanded' } },
  };
  const audioFields = {
    device: { label: 'Device', value: 'output', choices: { output: 'Speakers', microphone: 'Microphone' } },
    defaultLevel: { label: 'Reset level (%)', value: 50, min: 0, max: 100 },
    modePicker: { label: 'Control mode', value: 'off', optional: true, choices: { off: 'Audio only', on: 'Quick selector' } },
  };
  const catalog = {
    'now-playing': {
      name: 'Now Playing',
      provider: 'Windows media sessions',
      description: 'Show the current track and control supported players.',
      requirement: 'A Windows app or browser that exposes media controls.',
      size: { cols: 2, rows: 1 },
      fields: mediaFields,
    },
    spotify: {
      name: 'Spotify',
      provider: 'Spotify desktop via Windows media',
      description: 'Show the Spotify track and use available desktop player controls.',
      requirement: 'Spotify desktop must publish a Windows media session.',
      size: { cols: 2, rows: 1 },
      fields: mediaFields,
    },
    netflix: {
      name: 'Netflix companion',
      provider: 'Identified Netflix sessions via Windows media',
      description: 'Open saved Netflix titles and control a compatible Netflix Windows session.',
      requirement: 'Playback stays in the Netflix Windows app or your browser.',
      size: { cols: 2, rows: 1 },
      fields: mediaFields,
    },
    'system-metric': {
      name: 'System metric',
      provider: 'Lastra telemetry',
      description: 'Show a current reading or a short history.',
      requirement: 'Device-specific readings require a connected LibreHardwareMonitor source.',
      size: { cols: 1, rows: 1 },
      fields: {
        metric: {
          label: 'Reading',
          value: 'cpu',
          choices: { cpu: 'CPU load', ram: 'RAM usage', gpu: 'GPU load', cpuTemp: 'CPU temperature', gpuTemp: 'GPU temperature' },
        },
        shape: { label: 'Display', value: 'stat', choices: { stat: 'Stat', gauge: 'Gauge', graph: 'Graph' } },
      },
    },
    'audio-fader': {
      name: 'Audio fader',
      provider: 'Windows audio',
      description: 'Adjust a speaker or microphone level and reset it to a preset value.',
      requirement: 'An available Windows audio endpoint.',
      size: { cols: 2, rows: 1 },
      fields: {
        ...audioFields,
        orientation: { label: 'Orientation', value: 'horizontal', choices: { horizontal: 'Horizontal', vertical: 'Vertical' } },
      },
    },
    timers: {
      name: 'Timers',
      provider: 'Lastra timers',
      description: 'Follow countdowns and stopwatches, pause or dismiss them, and start a new one.',
      requirement: 'Start a timer from this widget or from a key with a Timer action.',
      size: { cols: 2, rows: 1 },
      fields: {
        quickMinutes: { label: 'Quick countdown (minutes)', value: 5, min: 1, max: 180 },
      },
    },
    decision: {
      name: 'Quick decision',
      provider: 'Lastra',
      description: 'Flip a coin, roll a six-sided die, or pick from a list.',
      requirement: 'Set the list for the Pick button in the widget editor.',
      size: { cols: 1, rows: 1 },
      fields: { options: { label: 'Pick options', value: DEFAULT_CHOICES } },
    },
    composition: {
      name: 'Composition',
      provider: 'Text, icons and telemetry',
      description: 'Arrange text, icons, gauges and graphs in a single tile.',
      requirement: 'Sensor parts depend on their selected readings.',
      size: { cols: 2, rows: 2 },
      fields: {},
    },
    'audio-encoder': {
      name: 'Audio encoder',
      provider: 'Windows audio',
      description: 'Step the current speaker or microphone level up or down and switch to fine adjustment.',
      requirement: 'An available Windows audio endpoint.',
      size: { cols: 2, rows: 1 },
      fields: {
        ...audioFields,
        step: { label: 'Step (%)', value: 5, min: 2, max: 20 },
      },
    },
    'virtual-dial': {
      name: 'Virtual dial',
      provider: 'Windows audio and verified control modes',
      description: 'Turn the inner ring for fine steps or the outer ring for faster steps. Tap to reset.',
      requirement: 'A readable Windows audio endpoint or a verified control mode.',
      size: { cols: 2, rows: 2 },
      fields: { ...audioFields, step: { label: 'Fast step (%)', value: 5, min: 2, max: 20 } },
    },
  };

  function defaultSettings(type) {
    return Object.fromEntries(Object.entries(catalog[type].fields).map(([key, option]) => [key, option.value]));
  }

  function fits(layout, grid) {
    if (!layout || typeof layout !== 'object' || Array.isArray(layout)) return false;
    const { column, row, cols, rows } = layout;
    return [column, row, cols, rows].every(Number.isInteger)
      && column >= 0 && row >= 0 && cols > 0 && rows > 0
      && column + cols <= grid.cols && row + rows <= grid.rows;
  }

  function cells(layout, columns) {
    const indices = [];
    for (let y = layout.row; y < layout.row + layout.rows; y++) {
      for (let x = layout.column; x < layout.column + layout.cols; x++) indices.push(y * columns + x);
    }
    return indices;
  }

  function keyLayout(key, index, grid) {
    return { column: index % grid.cols, row: Math.floor(index / grid.cols),
      cols: key?.span?.cols ?? 1, rows: key?.span?.rows ?? 1 };
  }

  function occupiedCells(grid, keys = [], widgets = []) {
    const occupied = new Set();
    keys.forEach((key, index) => {
      if (!key) return;
      const placement = keyLayout(key, index, grid);
      if (fits(placement, grid)) for (const cell of cells(placement, grid.cols)) occupied.add(cell);
    });
    for (const widget of widgets) {
      if (!fits(widget.layout, grid)) continue;
      for (const index of cells(widget.layout, grid.cols)) occupied.add(index);
    }
    return occupied;
  }

  function remapKeys(keys, before, after) {
    const mapped = [];
    const occupied = new Set();
    for (const [index, key] of keys.entries()) {
      if (!key) continue;
      const placement = keyLayout(key, index, before);
      if (!canPlace(placement, after, occupied)) return null;
      mapped[placement.row * after.cols + placement.column] = key;
      for (const cell of cells(placement, after.cols)) occupied.add(cell);
    }
    return Array.from(mapped, (key) => key ?? null);
  }

  function canPlace(layout, grid, occupied) {
    return fits(layout, grid) && cells(layout, grid.cols).every((index) => !occupied.has(index));
  }

  function findPosition(grid, occupied, size) {
    for (let row = 0; row + size.rows <= grid.rows; row++) {
      for (let column = 0; column + size.cols <= grid.cols; column++) {
        const layout = { column, row, ...size };
        if (canPlace(layout, grid, occupied)) return layout;
      }
    }
    return null;
  }

  function sameWidgetLayout(left, right) {
    return left && right && left.column === right.column && left.row === right.row
      && left.cols === right.cols && left.rows === right.rows;
  }

  function groupWidgetPlacements(widgets) {
    const placements = [];
    const stacks = new Map();
    for (const widget of widgets) {
      let group = widget.stackId && stacks.get(widget.stackId);
      if (!group) {
        group = { layout: widget.layout, members: [] };
        placements.push(group);
        if (widget.stackId) stacks.set(widget.stackId, group);
      }
      group.members.push(widget);
    }
    return placements;
  }

  function widgetTabLabel(widget) {
    if (widget.tabLabel) return widget.tabLabel;
    if (widget.type === 'composition') return widget.settings?.composition?.name ?? catalog.composition.name;
    if (widget.type === 'system-metric') {
      return catalog['system-metric'].fields.metric.choices[widget.settings?.metric] ?? catalog['system-metric'].name;
    }
    return catalog[widget.type].name;
  }

  function pruneWidgetStacks(widgets) {
    const singletons = new Set(groupWidgetPlacements(widgets).filter(({ members }) => members.length === 1)
      .map(({ members }) => members[0].stackId).filter(Boolean));
    return widgets.map((widget) => {
      if (!singletons.has(widget.stackId)) return widget;
      const { stackId, ...single } = widget;
      return single;
    });
  }

  function placeWidget(widgets, widget, target, createId = () => crypto.randomUUID()) {
    const previous = widgets.find(({ id }) => id === widget.id);
    const stackId = target ? target.stackId ?? createId() : undefined;
    const next = { ...widget };
    if (target) {
      next.stackId = stackId;
      next.layout = { ...target.layout };
    } else delete next.stackId;
    const moveToEnd = target && previous?.stackId !== stackId;
    const placed = widgets.flatMap((entry) => {
      if (entry.id === next.id) return moveToEnd ? [] : [next];
      if (entry.id === target?.id && !entry.stackId) return [{ ...entry, stackId }];
      return [entry];
    });
    if (!previous || moveToEnd) placed.push(next);
    return pruneWidgetStacks(placed);
  }

  function projectPage(grid, slots, widgets, columns) {
    const origins = new Map(groupWidgetPlacements(widgets).map((group) => [
      group.layout.row * grid.cols + group.layout.column, group,
    ]));
    const reserved = occupiedCells(grid, slots, widgets);
    const keys = [];
    const cards = [];
    const occupied = new Set();
    let cursor = 0;
    let rows = 1;

    for (let index = 0; index < slots.length; index++) {
      const card = origins.get(index);
      if (!card && !slots[index] && reserved.has(index)) continue;
      const original = card?.layout ?? keyLayout(slots[index], index, grid);
      let layout;
      if (columns === grid.cols) {
        layout = original;
      } else {
        const cols = Math.min(columns, original.cols);
        const height = original.rows;
        do {
          layout = { column: cursor % columns, row: Math.floor(cursor / columns), cols, rows: height };
          cursor++;
        } while (layout.column + cols > columns || cells(layout, columns).some((cell) => occupied.has(cell)));
        cells(layout, columns).forEach((cell) => occupied.add(cell));
      }
      rows = Math.max(rows, layout.row + layout.rows);
      if (card) cards.push(...card.members.map((widget) => ({ ...widget, layout })));
      else keys.push({ index, layout });
    }
    return { rows, keys, widgets: cards };
  }

  const api = { MAX_WIDGETS, BAR_GRID, VIEW_GRID, catalog, defaultSettings, fits, cells, keyLayout,
    occupiedCells, remapKeys, canPlace, findPosition, projectPage, sameWidgetLayout, groupWidgetPlacements, widgetTabLabel,
    placeWidget, pruneWidgetStacks };
  if (typeof module === 'object') module.exports = api;
  else window.LastraWidgetLayout = api;
}
