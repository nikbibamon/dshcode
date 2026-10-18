'use strict';
const vscode = require('vscode');
const { randomUUID, createHash } = require('node:crypto');
const path = require('node:path');
const fs = require('node:fs/promises');
const { constants } = require('node:fs');
const core = require('./lib/client');
const { chatHtml } = require('./lib/chat-view');
const files = require('./lib/attachments');
const { ACTIONS, slashAction, fileReference } = require('./lib/actions');
const { createBot } = require('./lib/telegram-bot');

const AUTH_KEY = 'tvijo.auth';
const PENDING_KEY = 'tvijo.pending';
const CONVERSATION_KEY = 'tvijo.conversation';

function activate(context) {
  let chatView = null;
  let busy = false;
  let attaching = false;
  let attachments = [];
  let activeAbort = null;
  const handlers = new Map();
  let customerBot = null;
  let accountSnapshot = null;
  const status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 50);
  status.command = 'tvijo.account';
  context.subscriptions.push(status);

  const client = () => core.createClient({ base: vscode.workspace.getConfiguration('tvijo').get('apiBase') });

  async function readAuth() {
    const raw = await context.secrets.get(AUTH_KEY);
    if (!raw) return null;
    try { return JSON.parse(raw); } catch { return null; }
  }

  // A token is only valid for the service URL it was issued by; switching apiBase forces a new sign-in.
  async function requireAuth() {
    const auth = await readAuth();
    if (!auth?.access_token) throw new core.ServiceError('unauthorized', 'Sign in first: run "Tvijo: Sign in".');
    if (auth.api_base !== client().base) throw new core.ServiceError('unauthorized', 'The saved sign-in belongs to a different service URL. Sign in again.');
    if (auth.expires_at && Date.now() >= Date.parse(auth.expires_at)) throw new core.ServiceError('unauthorized', 'The sign-in has expired. Sign in again.');
    return auth;
  }

  async function refreshStatus() {
    const auth = await readAuth();
    const live = auth && auth.api_base === client().base && !(auth.expires_at && Date.now() >= Date.parse(auth.expires_at));
    status.text = live ? '$(sparkle) Tvijo' : '$(account) Tvijo: sign in';
    status.tooltip = live ? 'Tvijo DSHREM: signed in. Click for account and credit.' : 'Tvijo DSHREM: not signed in';
    status.command = live ? 'tvijo.account' : 'tvijo.signIn';
    status.show();
    accountSnapshot = null;
    if (live) { try { accountSnapshot = await client().account(auth.access_token); } catch { /* Keep chat usable when account lookup fails. */ } }
    if (chatView) await postChatState();
  }

  async function postChatState(message = '') {
    if (!chatView) return;
    const auth = await readAuth();
    const signedIn = !!(auth?.access_token && auth.api_base === client().base && !(auth.expires_at && Date.now() >= Date.parse(auth.expires_at)));
    const history = context.workspaceState.get(CONVERSATION_KEY) || [];
    const messages = history.map((item) => ({ role: item.role, content: item.display || item.content }));
    await chatView.webview.postMessage({ type: 'state', messages, signedIn, busy, attaching, account: accountSnapshot, workflow: vscode.workspace.getConfiguration('tvijo').get('model', 'coding') + ' · ' + vscode.workspace.getConfiguration('tvijo').get('agentMode', 'single'),
      attachments: attachments.map(files.attachmentSummary), botRunning: !!customerBot?.running,
      status: message || (attaching ? 'Preparing attachment…' : busy ? 'Answering…' : signedIn ? 'Ready' : 'Sign in to ask a question') });
  }

  function report(error) {
    const message = error instanceof core.ServiceError ? error.message : 'Unexpected error in the Tvijo extension.';
    const actions = error?.code === 'unauthorized' ? ['Sign in'] : error?.code === 'insufficient_credit' ? ['View usage'] : [];
    vscode.window.showErrorMessage(`Tvijo: ${message}`, ...actions).then((pick) => { if (pick === 'Sign in') vscode.commands.executeCommand('tvijo.signIn'); if (pick === 'View usage') vscode.commands.executeCommand('tvijo.account'); });
  }

  function command(id, fn) {
    handlers.set(id, fn);
    context.subscriptions.push(vscode.commands.registerCommand(id, async (...args) => {
      try { await fn(...args); } catch (error) { report(error); } finally { await refreshStatus(); }
    }));
  }

  function ensureIdle() {
    if (busy || attaching) throw new core.ServiceError('busy', 'Wait for the current question or attachment to finish.');
  }

  async function prepareAndAdd(name, bytes) {
    const digest = createHash('sha256').update(bytes).digest('hex');
    if (attachments.some((item) => item.sha256 === digest)) return;
    if (attachments.length >= 4) throw new core.ServiceError('attachment_count', 'Attach up to 4 files per question.');
    const item = await files.prepareAttachment(name, bytes, { languages: vscode.workspace.getConfiguration('tvijo').get('ocrLanguages', 'eng+rus') });
    const next = [...attachments, item];
    files.checkAttachmentSet(next);
    attachments = next;
  }

  async function attachBytes(name, bytes) {
    ensureIdle();
    attaching = true;
    try {
      await postChatState();
      await prepareAndAdd(name, bytes);
    } finally { attaching = false; await postChatState(); }
  }

  async function attachUri(uri) {
    ensureIdle();
    attaching = true;
    try {
    await postChatState();
    if (!uri || uri.scheme !== 'file') throw new core.ServiceError('attachment_path', 'Choose a saved file in an open workspace.');
    const folder = vscode.workspace.getWorkspaceFolder(uri);
    if (!folder) throw new core.ServiceError('outside_workspace', 'File paths must be inside an open workspace folder. Use Attach for a file on your computer.');
    const [root, resolved, stat] = await Promise.all([fs.realpath(folder.uri.fsPath), fs.realpath(uri.fsPath), fs.lstat(uri.fsPath)]);
    const relative = path.relative(root, resolved);
    if (stat.isSymbolicLink() || relative.startsWith('..' + path.sep) || relative === '..' || path.isAbsolute(relative) || !stat.isFile()) throw new core.ServiceError('attachment_path', 'Attach a regular workspace file, without symlinks or paths outside the workspace.');
    if (stat.size > files.MAX_FILE_BYTES) throw new core.ServiceError('attachment_size', 'Each attachment is limited to 2 MiB.');
    const label = path.relative(folder.uri.fsPath, uri.fsPath).split(path.sep).join('/');
    if (label.split('/').some((part) => ['.git', '.ssh', '.aws'].includes(part))) throw new core.ServiceError('attachment_refused', 'Private configuration folders cannot be attached.');
    const nameRefusal = core.checkKnowledgeFile(label, Buffer.alloc(0));
    if (nameRefusal) throw new core.ServiceError('attachment_refused', nameRefusal);
    const handle = await fs.open(resolved, constants.O_RDONLY | (constants.O_NOFOLLOW || 0));
    try {
      const bytes = Buffer.alloc(files.MAX_FILE_BYTES + 1);
      let length = 0;
      while (length < bytes.length) {
        const { bytesRead } = await handle.read(bytes, length, bytes.length - length, length);
        if (!bytesRead) break;
        length += bytesRead;
      }
      await prepareAndAdd(label, bytes.subarray(0, length));
    } finally { await handle.close(); }
    } finally { attaching = false; await postChatState(); }
  }

  async function openChat() {
    await vscode.commands.executeCommand('workbench.view.extension.tvijo');
    await vscode.commands.executeCommand('tvijo.chat.focus');
  }

  command('tvijo.openChat', openChat);
  command('tvijo.attachFile', async (uri) => {
    ensureIdle();
    if (!(uri instanceof vscode.Uri)) {
      const picked = await vscode.window.showOpenDialog({ canSelectMany: true, canSelectFolders: false, openLabel: 'Attach to Tvijo' });
      if (!picked) return;
      for (const target of picked) await attachUri(target);
    } else await attachUri(uri);
    await openChat();
  });
  command('tvijo.attachPath', async () => {
    ensureIdle();
    const input = await vscode.window.showInputBox({ title: 'Attach a workspace file', prompt: 'Absolute path, or a path relative to the active workspace. PNG/JPG use local text extraction.' });
    if (input?.trim()) await attachPath(input);
    await openChat();
  });
  async function attachPath(input) {
    const value = input.trim().replace(/^(["'])(.*)\1$/, '$2');
    const activeUri = vscode.window.activeTextEditor?.document.uri;
    const root = (activeUri && vscode.workspace.getWorkspaceFolder(activeUri) || vscode.workspace.workspaceFolders?.[0])?.uri.fsPath;
    if (!path.isAbsolute(value) && !root) throw new core.ServiceError('no_workspace', 'Open a workspace before attaching a relative path.');
    await attachUri(vscode.Uri.file(path.isAbsolute(value) ? value : path.resolve(root, value)));
  }
  command('tvijo.attachSelection', async () => {
    ensureIdle();
    const editor = vscode.window.activeTextEditor;
    if (!editor || editor.selection.isEmpty) throw new core.ServiceError('no_selection', 'Select code in the editor first.');
    const name = `${path.basename(editor.document.uri.fsPath)} lines ${editor.selection.start.line + 1}-${editor.selection.end.line + 1}`;
    await attachBytes(name, Buffer.from(editor.document.getText(editor.selection)));
    await openChat();
  });
  command('tvijo.clearAttachments', async () => { ensureIdle(); attachments = []; await postChatState(); });
  command('tvijo.commands', async () => {
    const picked = await vscode.window.showQuickPick(ACTIONS.map(([id, label, description]) => ({ id, label, description })), { title: 'Tvijo commands', placeHolder: 'Attach context, manage tasks, or check your account' });
    if (picked) await handlers.get(picked.id)();
  });
  command('tvijo.terminal', async () => {
    const cwd = vscode.workspace.workspaceFolders?.[0]?.uri;
    if (!cwd) throw new core.ServiceError('workspace_required', 'Open a project folder first.');
    const terminal = vscode.window.createTerminal({ name: 'DSHREM · project', cwd, env: { OPENAI_API_KEY: null, ANTHROPIC_API_KEY: null } });
    terminal.show();
  });
  command('tvijo.learn', () => vscode.env.openExternal(vscode.Uri.parse(new URL('/learn', client().base).toString())));
  command('tvijo.feedback', () => vscode.env.openExternal(vscode.Uri.parse(new URL('/feedback', client().base).toString())));
  command('tvijo.settings', () => vscode.commands.executeCommand('workbench.action.openSettings', '@ext:tvijo.tvijo-dshrem'));
  const publicSite = () => {
    const url = new URL(client().base);
    return ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) ? 'https://dsh.tvijo.com' : url.origin;
  };
  command('tvijo.productGuide', () => vscode.env.openExternal(vscode.Uri.parse(publicSite() + '/workspace-guide')));
  command('tvijo.connections', async () => {
    const picked = await vscode.window.showQuickPick([
      { label: 'Tvijo managed', id: 'managed', description: 'Active · service credit, limits and receipts; no API key' },
      { label: 'Your OpenRouter', id: 'openrouter', description: 'Pilot request only · key connection not activated' },
      { label: 'Your direct provider API', id: 'direct', description: 'Pilot request only · key connection not activated' },
      { label: 'Read connection and cost guide', id: 'guide', description: 'Tvijo service and provider costs explained' }
    ], { title: 'Tvijo connection · current inference remains managed' });
    if (!picked) return;
    if (picked.id === 'guide') return vscode.env.openExternal(vscode.Uri.parse(publicSite() + '/connections'));
    const auth = await requireAuth();
    const state = await client().request('/workspace/connection', { token: auth.access_token, method: 'POST', body: { mode: picked.id } });
    vscode.window.showInformationMessage(state.preferred_mode === 'managed' ? 'Tvijo: managed service selected.' : 'Tvijo: pilot request saved. Your active route remains Tvijo. No API key or payment was requested.');
  });
  command('tvijo.usage', async () => {
    const auth = await requireAuth();
    const usage = await client().request('/workspace/usage', { token: auth.access_token });
    const current = await readAuth();
    if (!current || current.access_token !== auth.access_token || current.api_base !== client().base) return;
    if (chatView) await chatView.webview.postMessage({ type: 'usage', usage });
    else await showDocument('json', JSON.stringify(usage, null, 2));
  });
  command('tvijo.botGuide', () => vscode.env.openExternal(vscode.Uri.parse(publicSite() + '/bot')));
  command('tvijo.buyCredit', async () => {
    const auth = await requireAuth();
    const order = await client().request('/billing/orders', { token: auth.access_token, method: 'POST', body: { idempotency_key: randomUUID() } });
    await vscode.window.showInformationMessage(`Tvijo order ${order.id}: $10, ${order.status}. Credit is added only after verified payment.`);
    await vscode.env.openExternal(vscode.Uri.parse(order.billing_url));
  });
  command('tvijo.chooseWorkflow', async () => {
    const auth = await requireAuth();
    const available = await client().request('/models', { token: auth.access_token });
    const model = await vscode.window.showQuickPick([{ label: 'Automatic', id: 'auto', description: 'Deterministic task routing' }, ...available.data.filter(item => item.enabled).map(item => ({ label: item.name, id: item.id, description: 'Activated route; $1 shared task ceiling' }))], { title: 'Tvijo model' });
    if (!model) return;
    const mode = await vscode.window.showQuickPick(['single', 'auto', 'council'], { title: 'Tvijo workflow — council calls share the same $1 task cap' });
    if (!mode) return;
    const method = await vscode.window.showQuickPick(['evidence-first', 'plan-check', 'peer-review'], { title: 'Tvijo reasoning method' });
    if (!method) return;
    const configuration = vscode.workspace.getConfiguration('tvijo');
    await configuration.update('model', model.id, vscode.ConfigurationTarget.Global);
    await configuration.update('agentMode', mode, vscode.ConfigurationTarget.Global);
    await configuration.update('reasoningMethod', method, vscode.ConfigurationTarget.Global);
    await postChatState(`Selected ${model.id} · ${mode} · ${method}`);
  });
  command('tvijo.configureBot', async () => {
    const config = vscode.workspace.getConfiguration('tvijo');
    const owner = await vscode.window.showInputBox({ title: 'Your numeric Telegram owner ID', value: config.get('telegram.ownerId', ''), prompt: 'Only this account in private chat can control your bot. BotFather creates the bot; your user ID is a separate number.', validateInput: value => /^[1-9]\d{4,19}$/.test(value) ? undefined : 'Enter your numeric Telegram user ID.' });
    if (!owner) return;
    const token = await vscode.window.showInputBox({ title: 'Your BotFather token', password: true, ignoreFocusOut: true, prompt: 'Stored in VS Code SecretStorage. Never add it to settings.json or source files.' });
    if (!token) return;
    if (!/^\d+:[A-Za-z0-9_-]{20,}$/.test(token)) throw new core.ServiceError('bot_token', 'Use the token from the official @BotFather /newbot command.');
    await context.secrets.store('tvijo.telegram.token', token);
    await config.update('telegram.ownerId', owner, vscode.ConfigurationTarget.Global);
    await vscode.window.showInformationMessage('Bot configured locally. Run Tvijo: Start Telegram bot after signing in to DSHREM.');
  });
  command('tvijo.startBot', async () => {
    ensureIdle();
    if (customerBot?.running) return;
    const auth = await requireAuth();
    const config = vscode.workspace.getConfiguration('tvijo');
    customerBot = createBot({ botToken: await context.secrets.get('tvijo.telegram.token'), ownerId: config.get('telegram.ownerId', ''), apiBase: client().base, accessToken: auth.access_token, allowedServices: config.get('telegram.allowedServices', []),
      withAction: async action => { if (busy) throw new Error('Editor is busy. Retry your command after it finishes.'); busy = true; try { return await action(); } finally { busy = false; await postChatState(); } },
      load: async () => ({ model: config.get('model', 'coding'), mode: config.get('agentMode', 'single'), method: config.get('reasoningMethod', 'evidence-first'), ...(context.globalState.get('tvijo.botState') || {}), pending: context.globalState.get(PENDING_KEY) || null }),
      save: async state => { const { pending, ...rest } = state; await context.globalState.update('tvijo.botState', rest); await context.globalState.update(PENDING_KEY, pending || undefined); } });
    const result = await customerBot.start();
    await config.update('telegram.enabled', true, vscode.ConfigurationTarget.Global);
    customerBot.poll().catch(error => { report(error); refreshStatus(); });
    await vscode.window.showInformationMessage(`Your bot @${result.username} is running on this extension host. Send /help from your configured owner account.`);
  });
  command('tvijo.stopBot', async () => { customerBot?.stop(); customerBot = null; await vscode.workspace.getConfiguration('tvijo').update('telegram.enabled', false, vscode.ConfigurationTarget.Global); });
  context.subscriptions.push({ dispose() { customerBot?.stop(); } });
  async function showDocument(language, content) {
    const doc = await vscode.workspace.openTextDocument({ language, content });
    await vscode.window.showTextDocument(doc, { preview: false });
  }
  command('tvijo.status', async () => {
    const api = client();
    const health = await api.request('/health');
    await showDocument('json', JSON.stringify({ service: api.base, health, image_mode: 'local OCR text, not visual reasoning', sends_on: 'Ask only', max_task_usd: '1' }, null, 2));
  });
  command('tvijo.tasks', async () => { const auth = await requireAuth(); await showDocument('json', JSON.stringify(await client().request('/tasks', { token: auth.access_token }), null, 2)); });
  command('tvijo.export', async () => {
    const history = context.workspaceState.get(CONVERSATION_KEY) || [];
    await showDocument('markdown', '# Tvijo conversation\n\n' + history.map((item) => `## ${item.role === 'user' ? 'You' : 'Tvijo'}\n\n${item.display || item.content}`).join('\n\n'));
  });
  command('tvijo.help', () => showDocument('markdown', '# Tvijo DSHREM\n\nClick **Attach** to choose a file on your computer, paste a PNG/JPG screenshot, or drop a file into the chat. Use **Workspace** or `/attach path/to/file` for files on the SSH host. Select code and click **Selection** to attach only those lines.\n\nImages use local text extraction (OCR); the model does not see visual layout. Files are context for the next question. Knowledge-base uploads are a separate, confirmed action. Nothing is sent to the model until **Ask**. Each question has a $1 cap. This client answers questions and suggests changes; it does not execute shell commands or edit files.\n\n' + ACTIONS.map(([, label, detail]) => `- **${label}**${detail ? ` — ${detail}` : ''}`).join('\n')));

  command('tvijo.signIn', async () => {
    const api = client();
    const device = await api.startDeviceLogin();
    const approval = new URL(device.verification_uri);
    approval.searchParams.set('code', device.user_code);
    const target = vscode.Uri.parse(approval.toString());
    await vscode.env.clipboard.writeText(device.user_code);
    const pick = await vscode.window.showInformationMessage(
      `Tvijo: ${device.user_code}`,
      { detail: 'Only the eight-character code was copied. Open the approval link; the code is already filled in.' },
      'Open browser', 'Copy code');
    if (pick === 'Copy code') await vscode.env.clipboard.writeText(device.user_code);
    if (pick === 'Open browser') await vscode.env.openExternal(target);
    const auth = await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Notification, title: 'Tvijo: approve sign-in in your browser', cancellable: true },
      (_progress, token) => {
        const abort = new AbortController();
        token.onCancellationRequested(() => abort.abort());
        return api.pollDeviceLogin(device, { signal: abort.signal });
      });
    await context.secrets.store(AUTH_KEY, JSON.stringify(auth));
    vscode.window.showInformationMessage('Tvijo: signed in. The token is kept in VS Code secret storage.');
  });

  command('tvijo.signOut', async () => {
    customerBot?.stop(); customerBot = null;
    const auth = await readAuth();
    if (auth?.access_token && auth.api_base === client().base) {
      try { await client().logout(auth.access_token); } catch { /* Local sign-out still proceeds. */ }
    }
    await context.secrets.delete(AUTH_KEY);
    vscode.window.showInformationMessage('Tvijo: signed out on this machine.');
  });

  command('tvijo.account', async () => {
    const auth = await requireAuth();
    const account = await client().account(auth.access_token);
    const doc = await vscode.workspace.openTextDocument({ language: 'json', content: JSON.stringify(account, null, 2) });
    await vscode.window.showTextDocument(doc, { preview: true });
  });

  command('tvijo.newConversation', async () => {
    ensureIdle();
    await context.workspaceState.update(CONVERSATION_KEY, []);
    attachments = [];
    await postChatState();
    vscode.window.showInformationMessage('Tvijo: new conversation started.');
  });

  command('tvijo.cancelPending', async () => {
    activeAbort?.abort();
    const pending = context.globalState.get(PENDING_KEY);
    if (!pending) { vscode.window.showInformationMessage('Tvijo: nothing pending.'); return; }
    const auth = await requireAuth();
    if (pending.apiBase && pending.apiBase !== client().base) throw new core.ServiceError('pending_task', 'Switch back to the original service to reconcile its pending task.');
    if (!pending.taskId) {
      if (!pending.request) throw new core.ServiceError('pending_task', 'An older grant is unresolved. Wait for its expiry and check the account before clearing local state.');
      const grant = await client().request('/tasks', { token: auth.access_token, method: 'POST', body: pending.request });
      pending.taskId = grant.id;
      await context.globalState.update(PENDING_KEY, pending);
    }
    await client().cancel(auth.access_token, pending.taskId);
    const state = await client().taskState(auth.access_token, pending.taskId);
    if (!core.pendingBlocks(state)) await context.globalState.update(PENDING_KEY, undefined);
    vscode.window.showInformationMessage(`Tvijo: task ${pending.taskId} is ${state.status || 'unknown'}, held ${state.held ?? 'unknown'} USD.`);
  });

  // Never start a second paid task while an earlier one may still hold money.
  async function clearPending(auth) {
    const pending = context.globalState.get(PENDING_KEY);
    if (!pending) return;
    if (pending.apiBase && pending.apiBase !== client().base) throw new core.ServiceError('pending_task', 'An earlier task belongs to another service URL. Reconcile it there first.');
    if (!pending.taskId) throw new core.ServiceError('pending_task', 'A grant may still exist. Use Cancel pending task to reconcile it before another question.');
    const state = await client().taskState(auth.access_token, pending.taskId);
    if (core.pendingBlocks(state)) {
      throw new core.ServiceError('pending_task', `Task ${pending.taskId} is ${state.status || 'unresolved'} with held ${state.held ?? 'unknown'} USD. Run "Tvijo: Cancel pending task" or wait; no new paid task was created.`);
    }
    await context.globalState.update(PENDING_KEY, undefined);
  }

  async function askQuestion(question, { showEditor = false, includeSelection = false } = {}) {
    ensureIdle();
    if (!question?.trim()) return;
    busy = true;
    try {
    await postChatState();
    const auth = await requireAuth();
    const editor = vscode.window.activeTextEditor;
    let selection = null;
    if (includeSelection && editor && !editor.selection.isEmpty) {
      const folder = vscode.workspace.getWorkspaceFolder(editor.document.uri);
      selection = {
        path: folder ? path.relative(folder.uri.fsPath, editor.document.uri.fsPath).split(path.sep).join('/') : path.basename(editor.document.uri.fsPath),
        startLine: editor.selection.start.line + 1,
        endLine: editor.selection.end.line + 1,
        language: editor.document.languageId,
        text: editor.document.getText(editor.selection)
      };
    }
    await clearPending(auth);
    const history = context.workspaceState.get(CONVERSATION_KEY) || [];
    const sentAttachments = attachments.slice();
    const content = files.questionWithAttachments(core.questionWithSelection(question.trim(), selection), sentAttachments);
    const messages = [...history.map((item) => ({ role: item.role, content: item.content })), { role: 'user', content }];
    const idempotencyKey = randomUUID();
    const config = vscode.workspace.getConfiguration('tvijo');
    const grantRequest = { title: `VS Code: ${question.trim().slice(0, 80)}`, max_usd: '1', model: config.get('model', 'coding'), mode: config.get('agentMode', 'single'), method: config.get('reasoningMethod', 'evidence-first'), idempotency_key: idempotencyKey };
    await context.globalState.update(PENDING_KEY, { idempotencyKey, request: grantRequest, apiBase: client().base, createdAt: new Date().toISOString() });
      const answer = await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Notification, title: 'Tvijo is answering…', cancellable: true },
      (_progress, token) => {
        const abort = new AbortController();
        activeAbort = abort;
        let taskId = null;
        token.onCancellationRequested(() => {
          abort.abort();
          if (taskId) client().cancel(auth.access_token, taskId).catch(() => { /* Best effort; no retry. */ });
        });
        return client().ask({
          token: auth.access_token, messages, idempotencyKey, signal: abort.signal,
          model: grantRequest.model, mode: grantRequest.mode, method: grantRequest.method,
          title: `VS Code: ${question.trim().slice(0, 80)}`,
          onGrant: async (grant) => { taskId = grant.id; await context.globalState.update(PENDING_KEY, { idempotencyKey, request: grantRequest, apiBase: client().base, taskId: grant.id, createdAt: new Date().toISOString() }); }
        });
      });
      await context.globalState.update(PENDING_KEY, undefined);
      const formatted = core.formatAnswer({ question: question.trim(), answer });
      const userDisplay = question.trim() + (sentAttachments.length ? '\n\nAttached: ' + sentAttachments.map((item) => `${item.name}${item.kind === 'image' ? ' (image text)' : ''}`).join(', ') : '');
      const stored = [...history, { role: 'user', content, display: userDisplay }, { role: 'assistant', content: answer.content, display: formatted }].slice(-40);
      await context.workspaceState.update(CONVERSATION_KEY, stored);
      const sentIds = new Set(sentAttachments.map((item) => item.id));
      attachments = attachments.filter((item) => !sentIds.has(item.id));
      await postChatState();
      if (showEditor) {
        const doc = await vscode.workspace.openTextDocument({ language: 'markdown', content: formatted });
        await vscode.window.showTextDocument(doc, { viewColumn: vscode.ViewColumn.Beside, preview: false });
      }
    } finally {
      activeAbort = null;
      busy = false;
      await postChatState();
    }
  }

  command('tvijo.ask', async () => {
    const editor = vscode.window.activeTextEditor;
    const selection = editor && !editor.selection.isEmpty;
    const question = await vscode.window.showInputBox({
      title: 'Ask Tvijo DSHREM',
      prompt: selection ? 'Ask about your selection. One paid task, capped at 1 USD.' : 'One paid task, capped at 1 USD.',
      ignoreFocusOut: true
    });
    await askQuestion(question, { showEditor: true, includeSelection: true });
  });

  context.subscriptions.push(vscode.window.registerWebviewViewProvider('tvijo.chat', {
    resolveWebviewView(view) {
      chatView = view;
      view.webview.options = { enableScripts: true };
      view.webview.html = chatHtml(view.webview);
      const listener = view.webview.onDidReceiveMessage(async (message) => {
        try {
          if (message?.type === 'ready') await postChatState();
          else if (message?.type === 'attach') {
            if (typeof message.base64 !== 'string' || message.base64.length > Math.ceil(files.MAX_FILE_BYTES / 3) * 4 || !/^[A-Za-z0-9+/]*={0,2}$/.test(message.base64)) throw new core.ServiceError('attachment_size', 'Attach a file no larger than 2 MiB.');
            const bytes = Buffer.from(message.base64, 'base64');
            if (bytes.toString('base64') !== message.base64) throw new core.ServiceError('attachment_data', 'The attachment could not be read. Attach it again.');
            await attachBytes(message.name, bytes);
          } else if (message?.type === 'removeAttachment') {
            ensureIdle(); attachments = attachments.filter((item) => item.id !== message.id); await postChatState();
          } else if (message?.type === 'previewAttachment') {
            const item = attachments.find((item) => item.id === message.id);
            if (item) await showDocument('plaintext', item.name + '\n\n' + item.text);
          } else if (message?.type === 'copy' || message?.type === 'openAnswer') {
            const history = context.workspaceState.get(CONVERSATION_KEY) || [];
            const item = Number.isInteger(message.index) && history[message.index];
            if (!item || item.role !== 'assistant') return;
            if (message.type === 'copy') await vscode.env.clipboard.writeText(item.content);
            else await showDocument('markdown', item.display || item.content);
          } else if (message?.type === 'account') {
            const auth = await readAuth();
            const live = auth?.access_token && auth.api_base === client().base && !(auth.expires_at && Date.now() >= Date.parse(auth.expires_at));
            await vscode.commands.executeCommand(live ? 'tvijo.account' : 'tvijo.signIn');
          } else if (['new', 'cancel', 'commands', 'workspace', 'selection', 'path', 'help', 'bot', 'workflow', 'credit', 'terminal', 'settings', 'clearAttachments', 'usage', 'connections', 'productGuide'].includes(message?.type)) {
            const id = { new: 'tvijo.newConversation', cancel: 'tvijo.cancelPending', commands: 'tvijo.commands', workspace: 'tvijo.attachFile', selection: 'tvijo.attachSelection', path: 'tvijo.attachPath', help: 'tvijo.help', bot: 'tvijo.botGuide', workflow: 'tvijo.chooseWorkflow', credit: 'tvijo.buyCredit', terminal: 'tvijo.terminal', learn: 'tvijo.learn', feedback: 'tvijo.feedback', settings: 'tvijo.settings', clearAttachments: 'tvijo.clearAttachments', usage: 'tvijo.usage', connections: 'tvijo.connections', productGuide: 'tvijo.productGuide' }[message.type];
            await handlers.get(id)(); await refreshStatus();
          } else if (message?.type === 'ask' && typeof message.question === 'string') {
            try {
              const action = slashAction(message.question);
              const reference = fileReference(message.question);
              if (reference) { await attachPath(reference); await refreshStatus(); }
              else if (action) {
                if (!action.command) throw new core.ServiceError('unknown_command', 'Unknown command. Use /help or the Commands menu.');
                if (action.command === 'tvijo.attachFile' && action.argument) await attachPath(action.argument);
                else await handlers.get(action.command)();
                await refreshStatus();
              } else await askQuestion(message.question);
              await view.webview.postMessage({ type: 'submission', ok: true, question: message.question });
            } catch (error) {
              await view.webview.postMessage({ type: 'submission', ok: false, question: message.question });
              throw error;
            }
          }
        } catch (error) { report(error); await postChatState(error instanceof core.ServiceError ? error.message : 'Action failed. Check the selected workspace file and try again.'); }
        finally { if (message?.type === 'attach') await view.webview.postMessage({ type: 'attachmentDone' }); }
      });
      context.subscriptions.push(listener);
      view.onDidDispose(() => { listener.dispose(); if (chatView === view) chatView = null; });
    }
  }));

  command('tvijo.addFileToKnowledge', async (uri) => {
    const auth = await requireAuth();
    const target = uri instanceof vscode.Uri ? uri : vscode.window.activeTextEditor?.document.uri;
    if (!target || target.scheme !== 'file') throw new core.ServiceError('no_file', 'Open or select a saved file inside the workspace.');
    const folder = vscode.workspace.getWorkspaceFolder(target);
    if (!folder) throw new core.ServiceError('outside_workspace', 'Only files inside an open workspace folder can be added.');
    const stat = await vscode.workspace.fs.stat(target);
    if (stat.type & vscode.FileType.SymbolicLink) throw new core.ServiceError('symlink', 'Symlinks are not accepted.');
    const label = path.relative(folder.uri.fsPath, target.fsPath).split(path.sep).join('/');
    const bytes = await vscode.workspace.fs.readFile(target);
    const refusal = core.checkKnowledgeFile(label, bytes);
    if (refusal) throw new core.ServiceError('refused', refusal);
    const confirm = await vscode.window.showWarningMessage(`Upload ${label} to your private Tvijo knowledge base?`, { modal: true }, 'Upload');
    if (confirm !== 'Upload') return;
    await client().kbAdd(auth.access_token, label, Buffer.from(bytes).toString('utf8'));
    vscode.window.showInformationMessage(`Tvijo: ${label} added to your knowledge base.`);
  });

  context.subscriptions.push(vscode.workspace.onDidChangeConfiguration((e) => { if (e.affectsConfiguration('tvijo.apiBase') || e.affectsConfiguration('tvijo.telegram.ownerId') || e.affectsConfiguration('tvijo.telegram.allowedServices') || (e.affectsConfiguration('tvijo.telegram.enabled') && !vscode.workspace.getConfiguration('tvijo').get('telegram.enabled', false))) { customerBot?.stop(); customerBot = null; refreshStatus(); } }));
  refreshStatus();
  if (vscode.workspace.getConfiguration('tvijo').get('telegram.enabled', false)) handlers.get('tvijo.startBot')().then(refreshStatus).catch(report);
}

function deactivate() {}

module.exports = { activate, deactivate };
