'use strict';

const assert = require('node:assert/strict');
const { readFileSync, writeFileSync } = require('node:fs');
const { join } = require('node:path');
const { test } = require('node:test');
const { ChatGptView, chatGptLink } = require('../src/main/app-view-chatgpt');
const { AppViews } = require('../src/main/app-views');
const { createActionRunner } = require('../src/main/actions');
const { SnippetLibrary } = require('../src/main/snippet-library');
const { snippetDraft } = require('../src/shared/snippets');
const { tempDir } = require('./helpers/temp-dir');

const CHAT_ID = '01234567-89ab-4cde-8123-456789abcdef';
const PROJECT = '/g/g-p-0123456789abcdef0123456789abcdef-sample/project';
const official = { executable: 'chatgpt.exe', appId: 'OpenAI.Codex_2p2nqsd0c76g0!App',
  id: '21:39', path: 'c:\\program files\\windowsapps\\openai.codex\\app\\chatgpt.exe' };

function fixture(t, overrides = {}) {
  const directory = tempDir(t, 'lastra-chatgpt-');
  const linksFile = join(directory, 'chatgpt.json');
  const snippetsFile = join(directory, 'snippets.json');
  const opened = [];
  const copied = [];
  const ran = [];
  const openConfig = (file) => { opened.push(file); return { ok: true }; };
  const snippets = new SnippetLibrary(snippetsFile, { openConfig, copyText: (text) => copied.push(text) });
  const provider = new ChatGptView(linksFile, { platform: 'win32', snippets, openConfig,
    run: (action) => { ran.push(action); return { ok: true }; }, ...overrides });
  const appViews = new AppViews(join(directory, 'app-views.json'), { providers: { chatgpt: provider } });
  const change = (command) => appViews.change({ type: 'provider', viewId: 'chatgpt', ...command });
  return { provider, appViews, change, linksFile, snippetsFile, opened, copied, ran };
}

test('saved ChatGPT links are limited to official conversation and Project routes', () => {
  assert.deepEqual(chatGptLink('https://chat.openai.com/c/' + CHAT_ID + '?source=a#top'),
    { url: 'https://chatgpt.com/c/' + CHAT_ID, kind: 'Chat' });
  assert.equal(chatGptLink('https://chatgpt.com/share/' + CHAT_ID).kind, 'Chat');
  assert.deepEqual(chatGptLink('https://chatgpt.com' + PROJECT + '/'), { url: 'https://chatgpt.com' + PROJECT, kind: 'Project' });
  assert.equal(chatGptLink('https://chatgpt.com' + PROJECT.replace('/project', '/c/' + CHAT_ID)).kind, 'Project');
  for (const url of ['http://chatgpt.com/c/' + CHAT_ID, 'https://chatgpt.com.example/c/' + CHAT_ID,
    'https://user@chatgpt.com/c/' + CHAT_ID, 'https://chatgpt.com:81/c/' + CHAT_ID, 'https://chatgpt.com/settings',
    'https://chatgpt.com/share/../../settings', 'file:///c/' + CHAT_ID]) assert.equal(chatGptLink(url), null, url);
});

test('the registered view opens only configured links and keeps provider settings local', async (t) => {
  const { appViews, change, linksFile, opened, ran } = fixture(t);
  assert.deepEqual(appViews.data('chatgpt').links, []);
  await change({ action: 'edit-links' });
  assert.deepEqual(opened, [linksFile]);
  assert.deepEqual(JSON.parse(readFileSync(linksFile, 'utf8')), { version: 1, links: [] });
  writeFileSync(linksFile, JSON.stringify({ version: 1, links: [
    { id: 'notes', name: 'My project', url: 'https://chatgpt.com' + PROJECT },
  ] }));
  assert.deepEqual(appViews.data('chatgpt').links, [{ id: 'notes', name: 'My project', kind: 'Project' }]);
  await change({ action: 'open-link', id: 'notes', url: 'https://example.invalid/' });
  assert.deepEqual(ran, [{ type: 'open', target: 'https://chatgpt.com' + PROJECT }]);
  await assert.rejects(change({ action: 'open-link', id: '../notes' }), /unavailable/);
  writeFileSync(linksFile, '[invalid config]');
  assert.match(appViews.data('chatgpt').message, /invalid JSON/);
  await assert.rejects(change({ action: 'open-link', id: 'notes' }), /invalid JSON/);
});

test('only a reviewed configured prompt reaches clipboard and text substitutions stay literal', async (t) => {
  const { appViews, change, snippetsFile, opened, copied } = fixture(t);
  const source = [
    { id: 'outline', name: 'Outline', kind: 'prompt', text: 'Outline {{ topic }}.\nUse {{topic}} as the title.' },
    { id: 'reply', name: 'Reply', kind: 'reply', text: 'Thanks.' },
  ];
  await change({ action: 'edit-snippets' });
  assert.deepEqual(opened, [snippetsFile]);
  assert.deepEqual(JSON.parse(readFileSync(snippetsFile, 'utf8')), { version: 1, snippets: [] });
  writeFileSync(snippetsFile, JSON.stringify({ version: 1, snippets: source }));
  const { snippets } = appViews.data('chatgpt').prompts;
  assert.deepEqual(snippets.map(({ id, fields }) => ({ id, fields })), [{ id: 'outline', fields: ['topic'] }]);
  const { id, revision, template } = snippets[0];
  const copy = (input) => change({ action: 'copy-snippet', id, revision, ...input });
  assert.deepEqual(snippetDraft(template, { topic: '{{literal}} $1' }),
    { text: 'Outline {{literal}} $1.\nUse {{literal}} $1 as the title.', missing: [] });
  await assert.rejects(copy({ values: {} }), /every snippet field/);
  await assert.rejects(copy({ values: { topic: 'x'.repeat(501) } }), /every snippet field/);
  await assert.rejects(copy({ id: 'reply' }), /snippet changed/);
  assert.deepEqual(copied, []);
  await copy({ values: { topic: 'Release notes' }, text: 'untrusted replacement' });
  assert.deepEqual(copied, ['Outline Release notes.\nUse Release notes as the title.']);
  source[0].text = 'A different prompt';
  writeFileSync(snippetsFile, JSON.stringify({ version: 1, snippets: source }));
  await assert.rejects(copy({ values: { topic: 'other' } }), /snippet changed/);
  assert.equal(copied.length, 1);
});

test('the companion hotkey targets only a verified Windows app and rechecks the exact window before input', async (t) => {
  const other = { ...official, executable: 'code.exe', appId: 'other', id: '41:1' };
  const replacement = { ...official, id: '21:45' };
  const impostor = { ...official, appId: 'com.other.chatgpt', id: '18:29' };
  let active = other;
  let switchBeforeSend = false;
  let candidates = [impostor, official];
  const focused = [];
  const sent = [];
  const windows = {
    foreground: () => active,
    list: (matches) => candidates.filter(matches),
    focus(matches, id) {
      const candidate = candidates.find((entry) => matches(entry) && entry.id === id);
      focused.push(id);
      if (candidate) active = candidate;
      return Boolean(candidate);
    },
  };
  const runner = createActionRunner({
    readForeground() {
      if (switchBeforeSend) active = replacement;
      return active.executable;
    },
    input: { sendChord: (combo) => sent.push(combo.map(({ name }) => name)) },
  });
  const { change } = fixture(t, { windows: () => windows, run: runner.run });
  const companion = () => change({ action: 'open-companion', keys: 'Ctrl+S' });
  assert.equal((await companion()).ok, true);
  assert.deepEqual(focused, [official.id]);
  assert.deepEqual(sent, [['alt', 'space']]);
  switchBeforeSend = true;
  assert.match((await companion()).message, /window changed/);
  assert.deepEqual(sent, [['alt', 'space']]);

  active = other;
  candidates = [official, replacement, impostor];
  await assert.rejects(companion(), /foreground/);
  candidates = [impostor];
  await assert.rejects(companion(), /Open the ChatGPT Windows app/);
  assert.deepEqual(sent, [['alt', 'space']]);
});
