// @ts-check
'use strict';

/**
 * The expansion uses the same starter-key tuples as the original packs.
 * @typedef {[id: string, label: string, icon: string, chord: string | string[], options?: {
 *   usLayout?: boolean, notation?: string, confirm?: boolean, source?: string, context?: string, mode?: string,
 *   group?: string, alternate?: boolean, minWindowsBuild?: number
 * }]} StarterKey
 *
 * @typedef {{ id: string, name: string, source: string, keys: any[][], executables?: string[],
 *   appIds?: string[], platform?: 'linux', executablePattern?: RegExp, pathContains?: string, windowMode?: string, previewMode?: string,
 *   hostedWindows?: { executables: string[], mode: string },
 *   localizedSources?: Record<string, string>, editingMode?: string, editing?: boolean,
 *   sites?: { host?: string, subdomain?: string, prefix?: string }[], manifests?: string[], manifestExample?: string
 * }} ShortcutPack
 */

/**
 * @param {string} id
 * @param {string} name
 * @param {string[]} executables Foreground processes, excluding shared hosts and launchers.
 * @param {string} source
 * @param {StarterKey[]} keys
 * @param {{ appIds?: string[], editing?: boolean, executablePattern?: RegExp, windowMode?: string,
 *   previewMode?: string, hostedWindows?: ShortcutPack['hostedWindows'] }} [options]
 */
function desktopPack(id, name, executables, source, keys, options = {}) {
  return { id, name, executables, source, keys, ...options };
}

/**
 * @param {string} id
 * @param {string} name
 * @param {string[]} manifests Common install-as-app addresses. Alternate IDs can be attached in the editor.
 * @param {string} source
 * @param {StarterKey[]} keys
 * @param {{ pathScoped?: boolean, editing?: boolean, tenant?: string }} [options]
 */
function webPack(id, name, manifests, source, keys, { pathScoped = false, editing = false, tenant } = {}) {
  const sites = manifests.map((address) => {
    const { hostname, pathname } = new URL(address);
    const prefix = pathname.endsWith('/') ? pathname : pathname + '/';
    return { host: tenant ? undefined : hostname, subdomain: tenant, ...(pathScoped ? { prefix } : {}) };
  });
  return { id, name, sites, manifests: tenant ? [] : manifests, manifestExample: manifests[0], source, keys, editing };
}

/** @returns {StarterKey} */
function usKey(id, label, icon, chord) {
  return [id, label, icon, chord, { usLayout: true, notation: chord.replace('char:', '') }];
}

/**
 * @param {string} group
 * @param {StarterKey[]} keys
 * @param {StarterKey[4]} defaults
 * @returns {StarterKey[]}
 */
function shortcutGroup(group, keys, defaults = {}) {
  return keys.map(([id, label, icon, chord, options]) => [id, label, icon, chord, { ...defaults, ...options, group }]);
}

/** @param {ShortcutPack[]} packs @param {Record<string, any[][]>} workflows */
function withShortcutWorkflows(packs, workflows) {
  return packs.map((pack) => Object.hasOwn(workflows, pack.id)
    ? { ...pack, keys: [...pack.keys, ...workflows[pack.id]] } : pack);
}

module.exports = { desktopPack, webPack, usKey, shortcutGroup, withShortcutWorkflows };
