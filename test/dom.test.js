'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');

class FakeElement {
  constructor(tag) {
    this.tagName = tag.toUpperCase();
    this.attributes = new Map();
    this.dataset = {};
    this.listeners = [];
    this.className = '';
    this.text = '';
    this.title = '';
  }
  get textContent() { return this.text; }
  set textContent(value) { this.text = value == null ? '' : String(value); }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  getAttribute(name) { return this.attributes.has(name) ? this.attributes.get(name) : null; }
  addEventListener(type, listener) { this.listeners.push([type, listener]); }
  click() { for (const [type, listener] of this.listeners) if (type === 'click') listener({ type }); }
}

global.document = { createElement: (tag) => new FakeElement(tag) };
const { element, button } = require('../src/shared/dom');

test('element accepts the positional className/text shorthand and an options object', () => {
  const plain = element('div');
  assert.equal(plain.tagName, 'DIV');
  assert.equal(plain.className, '');
  assert.equal(plain.textContent, '');

  const short = element('p', 'app-view-secondary', 'Ready');
  assert.equal(short.className, 'app-view-secondary');
  assert.equal(short.textContent, 'Ready');
  assert.equal(element('li', '', 0).textContent, '0', 'numbers are written as text');
  assert.equal(element('li', undefined, 'Text only').textContent, 'Text only');

  const full = element('section', { className: 'card', text: '<b>kept as text</b>', label: 'Card', title: 'Tip',
    dataset: { checkId: 'a' }, attrs: { role: 'status', hidden: null } });
  assert.equal(full.textContent, '<b>kept as text</b>');
  assert.equal(full.getAttribute('aria-label'), 'Card');
  assert.equal(full.title, 'Tip');
  assert.deepEqual(full.dataset, { checkId: 'a' });
  assert.equal(full.getAttribute('role'), 'status');
  assert.equal(full.getAttribute('hidden'), null, 'null attributes are skipped');
});

test('button is always type="button" and only sets the states it is given', () => {
  let clicks = 0;
  const plain = button('Reload', () => { clicks++; });
  assert.equal(plain.type, 'button');
  assert.equal(plain.textContent, 'Reload');
  assert.equal(plain.className, '');
  assert.equal(plain.disabled, undefined);
  assert.equal(plain.getAttribute('aria-pressed'), null);
  plain.click();
  assert.equal(clicks, 1);

  const stateful = button('›', undefined, { className: 'quiet', disabled: 1, pressed: false, label: 'Next containers',
    dataset: { githubFocus: 'repo-1' } });
  assert.equal(stateful.className, 'quiet');
  assert.equal(stateful.disabled, true);
  assert.equal(stateful.getAttribute('aria-pressed'), 'false');
  assert.equal(stateful.getAttribute('aria-label'), 'Next containers');
  assert.equal(stateful.textContent, '›', 'label is the accessible name, not the visible text');
  assert.equal(stateful.dataset.githubFocus, 'repo-1');
  assert.equal(stateful.listeners.length, 0, 'no handler is attached without onClick');
  assert.equal(button('Off', null, { disabled: false }).disabled, false);
});

test('every page loads the shared DOM helpers before a script that uses them', () => {
  const root = path.join(__dirname, '..', 'src');
  for (const page of ['renderer/index.html', 'editor/index.html', 'renderer/embed-window.html', 'restore/index.html',
    'agent-review/index.html', 'agent-preview/index.html']) {
    const file = path.join(root, page);
    const scripts = [...fs.readFileSync(file, 'utf8').matchAll(/<script src="([^"]+)"/g)].map((match) => match[1]);
    const helper = scripts.findIndex((source) => path.resolve(path.dirname(file), source) === path.join(root, 'shared', 'dom.js'));
    for (const [index, source] of scripts.entries()) {
      const code = fs.readFileSync(path.resolve(path.dirname(file), source), 'utf8');
      if (index === helper || !code.includes('LastraDom')) continue;
      assert.ok(helper !== -1 && helper < index, `${page} loads ${source} before ../shared/dom.js`);
    }
  }
});
