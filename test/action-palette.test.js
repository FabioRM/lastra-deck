'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { actionNames, findActions } = require('../src/editor/action-palette');
const { ACTION_TYPES } = require('../src/main/profile');

test('the action palette covers every supported action with help and an example', () => {
  assert.deepEqual(new Set(Object.keys(actionNames)), ACTION_TYPES);
  assert.ok(findActions('', '').every((action) => action.category && action.help && action.example));
});

test('action search matches case-insensitively by name, category, and example', () => {
  assert.deepEqual(findActions('  LAUNCH  ', 'Apps & files').map((action) => action.id), ['launch']);
  assert.deepEqual(findActions('FILES', '').map((action) => action.id), ['launch', 'open', 'workspace']);
  assert.deepEqual(findActions('ctrl+shift+s', '').map((action) => action.id), ['hotkey']);
  assert.deepEqual(findActions('MEDIA Volume', 'Audio & media').map((action) => action.id), ['media']);
});

test('the palette honours the action types permitted at the current nesting level', () => {
  const withoutSequences = Object.keys(actionNames).filter((type) => type !== 'sequence');
  assert.deepEqual(findActions('', 'Flow', withoutSequences).map((action) => action.id), ['delay', 'wait-for', 'if', 'repeat', 'choose', 'random']);
  assert.deepEqual(findActions('', 'Flow', withoutSequences.filter((type) => type !== 'repeat')).map((action) => action.id), ['delay', 'wait-for', 'if', 'choose', 'random']);
  assert.deepEqual(findActions('', 'Keyboard', []), []);
  assert.deepEqual(findActions('nonexistent-action', ''), []);
});
