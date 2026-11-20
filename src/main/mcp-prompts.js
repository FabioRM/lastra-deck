// @ts-check
'use strict';

const PROJECT = { name: 'project', description: 'Project or workflow to inspect.' };
const GOAL = { name: 'goal', description: 'Outcome or question for the review.' };
const ACTIVITY = { name: 'activity', description: 'One of main, work, meeting, gaming, streaming, or monitoring.' };
const PROVIDER = { name: 'provider', description: 'One of audio or obs.' };

const WORKFLOWS = new Map([
  ['inspect_deck_layout', {
    description: 'Validate and preview a supplied Lastra profile.',
    arguments: [],
    guidance: 'Ask for the profile and orientation if they are missing. Use validate_profile, then preview_profile. Review Deck Keys, positions, and fixed editing controls.',
  }],
  ['check_local_connection', {
    description: 'Diagnose access to the opted-in local Lastra instance.',
    arguments: [],
    guidance: 'Use capabilities and connection to check the local Lastra session. Report access and provider availability separately. For a missing grant, explain which permission the user can grant in the Lastra tray.',
  }],
  ['plan_activity_layout', {
    description: 'Design a dedicated layout for a project or activity.',
    arguments: [ACTIVITY, PROJECT, GOAL],
    guidance: 'Ask which actions must be reachable and which device orientation to use. Check the active profile only with its layout grant. Find suitable actions, widgets, and shortcuts with search_catalog. Propose a draft with grouped keys and provider requirements. If draft access is available, create a temporary profile_draft and preview it. Otherwise return profile JSON and run validate_profile and preview_profile. Present the changes and any unverified compatibility to the user.',
  }],
  ['audit_profile_shortcuts', {
    description: 'Review shortcut collisions, provenance, and applicability.',
    arguments: [PROJECT, GOAL],
    guidance: 'Use the approved profile snapshot or the supplied profile. Inspect overlapping keys, hold and double-tap bindings with compose_macro, and use search_catalog to verify sources, edition, keyboard layout, and context. Return proposed edits and any shortcuts that still need a live check.',
  }],
  ['diagnose_provider', {
    description: 'Inspect an audio or OBS availability and readback problem.',
    arguments: [PROVIDER, PROJECT, GOAL],
    guidance: 'Collect the expected state and symptom. Use provider_status and any approved events_since reading to confirm connection and freshness. For audio, ask which endpoint and which mute or signal state the deck shows. For OBS, distinguish a WebSocket connection from a confirmed production state. Return observations, likely cause, and the next check the user can review without changing provider state.',
  }],
  ['review_profile_migration', {
    description: 'Inspect results from a Lastra profile or shortcut pack migration.',
    arguments: [PROJECT, GOAL],
    guidance: 'Ask for the old and proposed profiles if missing. Validate and preview each in both orientations, compare page IDs, bindings, widget layout, and asset dependencies. Create a temporary draft only with a granted draft scope. Compare its proposed changes with profile_changes when authorised and return a review of differences, compatibility gaps, and recovery options for the user.',
  }],
  ['explain_macro_failure', {
    description: 'Explain a failed, skipped, or unavailable macro step.',
    arguments: [PROJECT, GOAL],
    guidance: 'Gather the affected page and key ID, expected result, gesture, observed feedback, and available provider state. Use compose_macro to check dependencies and simulate_gesture with reported conditions. Identify the first failing or skipped step and explain the impact on later steps. Show a proposed adjustment and an offline fixture the user can inspect.',
  }],
]);

const PROMPTS = Array.from(WORKFLOWS, ([name, { description, arguments: args }]) => ({
  name, description, ...(args.length ? { arguments: args } : {}),
}));
const ACTIVITIES = new Set(['main', 'work', 'meeting', 'gaming', 'streaming', 'monitoring']);
const PROVIDERS = new Set(['audio', 'obs']);

function promptResult(name, args = {}) {
  const prompt = WORKFLOWS.get(name);
  if (!prompt) return null;
  const allowed = prompt.arguments.map((item) => item.name);
  const parameters = Object.create(null);
  if (!args || typeof args !== 'object' || Array.isArray(args)) throw new Error('Supply named prompt arguments.');
  for (const [key, value] of Object.entries(args)) {
    if (!allowed.includes(key) || typeof value !== 'string' || value.length > 500 || !value.trim()) {
      throw new Error('Use the listed prompt arguments with values of 1 to 500 characters.');
    }
    parameters[key] = value.trim();
  }
  if (parameters.activity && !ACTIVITIES.has(parameters.activity)) throw new Error('Choose a listed activity.');
  if (parameters.provider && !PROVIDERS.has(parameters.provider)) throw new Error('Choose audio or obs.');
  const context = Object.keys(parameters).length ? '\n\nUser-supplied workflow details\n' + JSON.stringify(parameters, null, 2) : '';
  const resources = '\n\nCheck lastra://v1/capabilities and lastra://v1/reference for the current tools and project guides. '
    + 'Use only the grants available. Return a draft, review, or diagnosis for the user to inspect.';
  return { description: prompt.description, messages: [{ role: 'user', content: { type: 'text', text: prompt.guidance + resources + context } }] };
}

module.exports = { PROMPTS, promptResult };
