'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const path = require('node:path');

function memory(initial = {}) {
  const values = new Map(Object.entries(initial));
  return { get: (key) => values.get(key), update: async (key, value) => values.set(key, value), store: async (key, value) => values.set(key, value), delete: async (key) => values.delete(key) };
}

function host() {
  const base = 'http://localhost:18106/api/dshrem/v1';
  const commands = new Map();
  const posts = [];
  const docs = [];
  const requests = [];
  let provider;
  let receive;
  let disposal;
  let release;
  let blockGrant = false;
  const disposable = { dispose() {} };
  const root = path.resolve(__dirname, '../..');
  class Uri { constructor(fsPath) { this.fsPath = fsPath; this.scheme = 'file'; } static file(value) { return new Uri(value); } static parse(value) { return new Uri(value); } }
  const context = {
    subscriptions: [], globalState: memory(), workspaceState: memory(),
    secrets: memory({ 'tvijo.auth': JSON.stringify({ access_token: 'test-token', api_base: base }) })
  };
  const vscode = {
    Uri, StatusBarAlignment: { Right: 1 }, ProgressLocation: { Notification: 1 }, ViewColumn: { Beside: 2 },
    env: { clipboard: { writeText: async () => {} }, openExternal: async () => {} },
    commands: { registerCommand: (id, fn) => { commands.set(id, fn); return disposable; }, executeCommand: async (id, ...args) => commands.get(id)?.(...args) },
    workspace: {
      getConfiguration: () => ({ get: (key, fallback) => key === 'apiBase' ? base : fallback }),
      onDidChangeConfiguration: () => disposable,
      workspaceFolders: [{ uri: Uri.file(root) }],
      getWorkspaceFolder: (uri) => uri?.fsPath?.startsWith(root + path.sep) ? { uri: Uri.file(root) } : undefined,
      openTextDocument: async (doc) => { docs.push(doc); return doc; }
    },
    window: {
      createStatusBarItem: () => ({ show() {} }),
      registerWebviewViewProvider: (_id, value) => { provider = value; return disposable; },
      showErrorMessage: async () => undefined, showInformationMessage: async () => undefined,
      showTextDocument: async () => {},
      withProgress: async (_options, fn) => fn({}, { onCancellationRequested() {} })
    }
  };
  const originalLoad = Module._load;
  let extension;
  try {
    Module._load = function (id, ...args) { return id === 'vscode' ? vscode : originalLoad.call(this, id, ...args); };
    delete require.cache[require.resolve('../extension')];
    extension = require('../extension');
  } finally { Module._load = originalLoad; }
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    const body = options.body && JSON.parse(options.body);
    requests.push({ url, body });
    if (url.endsWith('/tasks') && options.method === 'POST') {
      if (blockGrant) await new Promise((resolve) => { release = resolve; });
      return Response.json({ id: 'task-test' });
    }
    if (url.endsWith('/chat')) return Response.json({ choices: [{ message: { content: 'Test answer' } }], task: { spent_usd: '0.001', held_usd: '0' }, evidence: [] });
    throw new Error('unexpected test URL');
  };
  extension.activate(context);
  provider.resolveWebviewView({
    webview: { cspSource: 'test:', onDidReceiveMessage: (fn) => { receive = fn; return disposable; }, postMessage: async (message) => { posts.push(message); return true; } },
    onDidDispose: (fn) => { disposal = fn; }
  });
  return { context, posts, docs, requests, commands, receive: (message) => receive(message),
    block: () => { blockGrant = true; }, unblock: () => release?.(),
    close: () => { disposal(); globalThis.fetch = originalFetch; } };
}

test('workspace attachments reach one task and slash help never creates a task', async () => {
  const app = host();
  try {
    await app.receive({ type: 'ask', question: '/attach vscode/lib/actions.js' });
    assert.equal(app.posts.filter((item) => item.type === 'state').at(-1).attachments.length, 1);
    await app.receive({ type: 'ask', question: 'vscode/lib/actions.js' });
    assert.equal(app.posts.filter((item) => item.type === 'state').at(-1).attachments.length, 1);
    assert.equal(app.requests.filter(item => !item.url.endsWith('/account')).length, 0);
    const attached = app.posts.filter((item) => item.type === 'state').at(-1).attachments[0];
    await app.receive({ type: 'previewAttachment', id: attached.id });
    assert.equal(app.docs.at(-1).language, 'plaintext');
    assert.match(app.docs.at(-1).content, /const ACTIONS/);
    await app.receive({ type: 'ask', question: 'Explain this module' });
    assert.equal(app.requests.filter((item) => item.url.endsWith('/tasks')).length, 1);
    const chat = app.requests.find((item) => item.url.endsWith('/chat'));
    assert.match(chat.body.messages.at(-1).content, /vscode\/lib\/actions.js/);
    assert.match(chat.body.messages.at(-1).content, /const ACTIONS/);
    assert.equal(app.posts.filter((item) => item.type === 'state').at(-1).attachments.length, 0);
    await app.receive({ type: 'ask', question: '/help' });
    assert.equal(app.requests.filter(item => !item.url.endsWith('/account')).length, 2);
    assert.match(app.docs.at(-1).content, /local text extraction/);
  } finally { app.close(); }
});

test('a second ask is rejected while the first awaits its grant', async () => {
  const app = host();
  try {
    app.block();
    const first = app.receive({ type: 'ask', question: 'First question' });
    for (let i = 0; i < 30 && !app.requests.some(item => item.url.endsWith('/tasks')); i++) await new Promise((resolve) => setImmediate(resolve));
    await app.receive({ type: 'ask', question: 'Second question' });
    assert.equal(app.requests.filter(item => item.url.endsWith('/tasks')).length, 1);
    assert.ok(app.posts.some((item) => item.type === 'submission' && item.question === 'Second question' && !item.ok));
    app.unblock(); await first;
    assert.equal(app.requests.filter((item) => item.url.endsWith('/tasks')).length, 1);
  } finally { app.unblock(); app.close(); }
});

test('credential attachments and unknown slash commands create no model task', async () => {
  const app = host();
  try {
    await app.receive({ type: 'attach', name: '.env', base64: Buffer.from('SAMPLE=value').toString('base64') });
    assert.equal(app.posts.filter((item) => item.type === 'state').at(-1).attachments.length, 0);
    assert.ok(app.posts.some((item) => item.type === 'attachmentDone'));
    await app.receive({ type: 'ask', question: '/does-not-exist' });
    assert.equal(app.requests.filter(item => !item.url.endsWith('/account')).length, 0);
    assert.ok(app.posts.some((item) => item.type === 'submission' && !item.ok));
  } finally { app.close(); }
});
