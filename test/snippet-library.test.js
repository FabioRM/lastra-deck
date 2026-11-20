'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const { AppViews } = require('../src/main/app-views');
const { ChatGptView } = require('../src/main/app-view-chatgpt');
const { SnippetLibrary } = require('../src/main/snippet-library');
const { tempDir } = require('./helpers/temp-dir');

test('the standalone view and ChatGPT share one library and keep their designated snippet kinds', async (t) => {
  const directory = tempDir(t, 'lastra-snippet-library-');
  const file = path.join(directory, 'snippets.json');
  const copies = [];
  const edits = [];
  const openConfig = (target) => { edits.push(target); return { ok: true }; };
  const snippets = new SnippetLibrary(file, { openConfig, copyText: (value) => copies.push(value) });
  const chatgpt = new ChatGptView(path.join(directory, 'chatgpt.json'), { snippets, openConfig });
  const views = new AppViews(path.join(directory, 'app-views.json'), { providers: { snippets, chatgpt } });
  const command = (viewId, action, options = {}) => views.change({ type: 'provider', viewId, action, ...options });
  assert.equal(views.snapshot().views.find(({ id }) => id === 'snippets').name, 'Snippet library');
  assert.deepEqual(views.data('snippets'), { snippets: [], message: null });
  await command('snippets', 'edit-snippets');
  await command('chatgpt', 'edit-snippets');
  assert.deepEqual(edits, [file, file]);
  const entries = [
    { id: 'one', kind: 'prompt', name: 'Briefing outline', text: 'Outline {{subject}}.' },
    { id: 'two', kind: 'reply', name: 'Review reply', text: 'Thank you, {{recipient}}.' },
    { id: 'three', name: 'Footer', text: 'Case reference' },
  ];
  const store = () => fs.writeFileSync(file, JSON.stringify({ version: 1, snippets: entries }));
  store();
  const opened = views.data('snippets').snippets;
  assert.deepEqual(opened.map(({ kind }) => kind), ['prompt', 'reply', 'text']);
  assert.deepEqual(views.data('chatgpt').prompts.snippets, [opened[0]]);
  assert.deepEqual(copies, []);
  const { id, revision } = opened[1];
  await assert.rejects(command('chatgpt', 'copy-snippet', { id, revision, values: { recipient: 'Fixture' } }), /changed/);
  await assert.rejects(command('snippets', 'copy-snippet', { id, revision }), /every snippet field/);
  assert.deepEqual(copies, []);
  await command('snippets', 'copy-snippet', { id, revision, values: { recipient: 'Fixture {{literal}}' } });
  assert.deepEqual(copies, ['Thank you, Fixture {{literal}}.']);
  entries[1].text = 'Different exact text.';
  store();
  await assert.rejects(command('snippets', 'copy-snippet', { id, revision }), /changed/);
  assert.equal(copies.length, 1);
  assert.equal(views.data('snippets').snippets[1].template, entries[1].text);
});
