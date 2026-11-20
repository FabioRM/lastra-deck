// @ts-check
'use strict';

const { createHash } = require('node:crypto');

function actionSlug(identifier) {
  return identifier.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

function commandIdentifier(form, identifier, notation) {
  if (form === 'identifiers' || form === 'case-sensitive-identifiers'
      || (form === 'qualified-identifiers' && identifier.includes(':'))) return identifier;
  if (form === 'slash') return notation.split(/\s/)[0];
  return undefined;
}

function createReferenceApplication(review, { id, name, edition, availability, groups }) {
  const variants = groups.flatMap(({ rows, source: defaultSource, commands }) => review[rows].flatMap((row) => {
    const [context, identifier, label, keys, options = {}] = row;
    const sourceId = options.source ?? defaultSource;
    const source = review.sources[sourceId];
    const notations = keys.length ? keys : ['Unassigned'];
    const platforms = options.platforms ?? ['windows'];
    const appVersion = options.appVersion ?? source.appVersion ?? null;
    const language = options.language ?? source.language ?? null;
    const action = actionSlug(identifier);
    const actionId = id + ':' + (commands === 'case-sensitive-identifiers' ? identifier : action);
    const scope = id + ':' + context;
    return platforms.flatMap((platform) => notations.map((notation) => {
      const kind = options.kind ?? (commands === 'slash' ? 'slash-command' : !keys.length ? 'unassigned'
        : notation.startsWith('Mouse ') ? 'gesture' : 'shortcut');
      const command = options.command ?? commandIdentifier(commands, identifier, notation);
      const identity = [actionId, scope, platform, notation, appVersion, options.when];
      if (language) identity.push(language);
      if (options.args !== undefined) identity.push(options.args);
      const bindingId = createHash('sha256').update(JSON.stringify(identity)).digest('hex').slice(0, 20);
      return {
        id: action, label, actionId, bindingId,
        context: scope, category: context, kind,
        platform, hostPlatform: platform, platforms: [platform], edition, appVersion,
        windowsBuild: null, language, layout: options.layout ?? null, mode: options.mode ?? null,
        source: source.url + (options.anchor ? '#' + options.anchor : ''), sourceRevision: source.revision,
        provenance: { sourceId, terms: source.terms, reuse: 'facts-only', label: 'lastra-authored' },
        verification: {
          status: source.method === 'installed-manifest' ? 'installed-manifest' : 'documented',
          date: review.reviewedOn, method: source.method,
        },
        chord: null, notation,
        ...(options.when ? { when: options.when } : {}),
        ...(options.requirement ? { requirement: options.requirement } : {}),
        ...(options.trigger ? { trigger: options.trigger } : {}),
        ...(options.aliases?.length ? { aliases: options.aliases } : {}),
        ...(notation.includes(' then ') && kind === 'shortcut'
          ? { strokes: notation.split(' then ').map((step) => step.split('+')) } : {}),
        ...(command ? { command } : {}),
        ...(options.args !== undefined ? { args: options.args } : {}),
        unavailable: availability,
      };
    }));
  }));
  return {
    id, name, platforms: [...new Set(variants.map(({ platform }) => platform))],
    catalogVersion: review.version, availability, referenceOnly: true, bindings: variants,
  };
}

module.exports = { createReferenceApplication };
