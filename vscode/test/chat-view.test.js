'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { chatHtml } = require('../lib/chat-view');

function sidebar() {
  const listeners = new Map();
  const elements = new Map();
  const created = [];
  const outgoing = [];
  let savedState = {};
  function element(id) {
    if (!elements.has(id)) elements.set(id, {
      value: '', disabled: false, textContent: '',
      attributes: {},
      addEventListener(type, fn) { listeners.set(`${id}:${type}`, fn); },
      focus() {}, replaceChildren() {}, append() {}, requestSubmit() {}, querySelectorAll() { return []; }, setAttribute(name, value) { this.attributes[name] = value; }, click() {}
    });
    return elements.get(id);
  }
  const document = { getElementById: element, body: element('body'), documentElement: element('html'), createElement: (tag) => { const node = { tag, append() {}, addEventListener() {}, setAttribute() {} }; created.push(node); return node; } };
  const window = { addEventListener(type, fn) { listeners.set(`window:${type}`, fn); } };
  const html = chatHtml({ cspSource: 'vscode-webview:' });
  const script = html.match(/<script nonce="[^"]+">([\s\S]*?)<\/script>/)?.[1];
  assert.ok(script, 'webview script exists');
  vm.runInNewContext(script, { document, window, acquireVsCodeApi: () => ({ postMessage: (message) => outgoing.push(message), getState: () => savedState, setState: (next) => { savedState = next; } }) });
  return { element, outgoing, created, state: () => savedState, emit: (key, event) => listeners.get(key)(event) };
}

test('sidebar keeps a rejected question and prevents a duplicate submit', () => {
  const view = sidebar();
  const question = view.element('question');
  question.value = 'Why is this slow?';
  const submit = () => view.emit('form:submit', { preventDefault() {} });
  submit();
  submit();
  assert.equal(view.outgoing.filter((item) => item.type === 'ask').length, 1);
  assert.equal(question.value, 'Why is this slow?');
  view.emit('window:message', { data: { type: 'submission', ok: false, question: 'Why is this slow?' } });
  assert.equal(question.value, 'Why is this slow?');
  assert.equal(view.element('send').disabled, false);
});

test('sidebar permits attachment-only questions and shows the image text boundary', () => {
  const view = sidebar();
  view.emit('window:message', { data: { type: 'state', messages: [], attachments: [{ id: 'image-1', name: 'screen.png', kind: 'image', size: 1024, preview: 'data:image/png;base64,AA==' }] } });
  assert.equal(view.element('ocrnote').hidden, false);
  view.emit('form:submit', { preventDefault() {} });
  assert.equal(view.outgoing.at(-1).question, 'Explain the attached context.');
});

test('sidebar clears only the accepted question, preserving a new draft', () => {
  const view = sidebar();
  const question = view.element('question');
  question.value = 'First question';
  view.emit('form:submit', { preventDefault() {} });
  question.value = 'Second draft';
  view.emit('window:message', { data: { type: 'submission', ok: true, question: 'First question' } });
  assert.equal(question.value, 'Second draft');
  view.emit('form:submit', { preventDefault() {} });
  view.emit('window:message', { data: { type: 'submission', ok: true, question: 'Second draft' } });
  assert.equal(question.value, '');
});

test('compact composer opens contextual actions and routes terminal tab to the extension', () => {
  const view = sidebar();
  view.emit('plus:click', {});
  assert.equal(view.element('plus-menu').className, 'open');
  view.emit('workspace:click', {});
  assert.equal(view.outgoing.at(-1).type, 'workspace');
  view.emit('tab-terminal:click', {});
  assert.equal(view.outgoing.at(-1).type, 'terminal');
  assert.equal(view.element('tab-terminal').attributes['aria-selected'], 'true');
});

test('locale and theme preferences persist and live preview values render from state', () => {
  const view = sidebar();
  view.emit('lang:click', {});
  assert.equal(view.state().locale, 'ru');
  assert.equal(view.element('html').lang, 'ru');
  view.emit('theme:click', {});
  assert.equal(view.state().theme, 'light');
  view.emit('window:message', { data: { type: 'state', messages: [], signedIn: false, account: { preview: { tasks_remaining: 3, tokens_remaining: 25000, remaining_usd: 0.02 } } } });
  assert.equal(view.element('budget').textContent, '3 задач · 25,000 токенов · $0.020');
  assert.equal(view.element('connection-label').textContent, 'Ограниченный бесплатный доступ');
});

test('theme uses cool blue palettes and embeds both interface languages', () => {
  const html = chatHtml({ cspSource: 'vscode-webview:' });
  assert.match(html, /#11151c/);
  assert.match(html, /#699cff/);
  assert.match(html, /#f7f9fc/);
  assert.match(html, /Build with context\./);
  assert.match(html, /Работайте с контекстом\./);
  assert.match(html, /role="menu"/);
  assert.doesNotMatch(html, /#f97316|#ff7a00|orange/i);
});


test('private usage tab requests receipts and clears them when the account changes', () => {
  const view = sidebar();
  let clearCount = 0;
  view.element('usage-items').replaceChildren = () => { clearCount++; };
  view.emit('tab-usage:click', {});
  assert.equal(view.outgoing.at(-1).type, 'usage');
  assert.equal(view.element('tab-usage').attributes['aria-selected'], 'true');
  view.emit('window:message', { data: { type: 'usage', usage: { account: { tenant_id: 'first', budget: { spent_usd:'0.01', held_usd:'0', remaining_usd:'0.04' } }, scope: { loaded_tasks:0, total_account_tasks:0 }, tasks:[] } } });
  view.emit('window:message', { data: { type: 'state', signedIn:false, messages:[], attachments:[] } });
  assert.equal(clearCount, 2, 'one render and one account-change clear');
  view.emit('connections:click', {});
  assert.equal(view.outgoing.at(-1).type,'connections');
  view.emit('product-guide:click', {});
  assert.equal(view.outgoing.at(-1).type,'productGuide');
});
