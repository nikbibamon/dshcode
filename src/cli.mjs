import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { randomUUID } from 'node:crypto';
import { request, currentAuth } from './api.mjs';
import { apiBase } from './config.mjs';
import { readAuth, saveAuth, removeAuth, createSession, saveSession, loadSession, listSessions, withSessionLock } from './storage.mjs';
import { readFile, lstat, realpath } from 'node:fs/promises';
import path from 'node:path';

const HELP = `dsh — remote DSHREM research and chat client

Usage:
  dsh [--help] | --version
  dsh login | logout | status | models | doctor
  dsh tasks | task ID | stop ID
  dsh chat [--session ID]
  dsh run TASK [--json]
  dsh sessions | list | resume [SESSION_ID]
  dsh reconcile SESSION_ID [--cancel]
  dsh kb add FILE | kb search QUERY | kb map

The client sends requests to the remote DSHREM service. It does not execute
generated code or run autonomous local tools. See docs/HELP.md for details.`;
const VERSION = '0.4.1';

function option(args, name) { const i = args.indexOf(name); return i < 0 ? null : args[i + 1] ?? null; }
function checkNode() { const major = Number(process.versions.node.split('.')[0]); if (major < 22) throw new Error('Node.js 22 or newer is required'); }
function printJson(value) { console.log(JSON.stringify(value, null, 2)); }

async function login() {
  const device = await request('/auth/device', { method: 'POST', body: {} });
  if (!device?.device_code || !device?.user_code || !device?.verification_uri) throw new Error('Service returned an incomplete device authorization response');
  console.log(`Open ${device.verification_uri_complete || device.verification_uri} and approve code: ${device.user_code}`);
  const interval = Math.max(1, Number(device.interval) || 5) * 1000;
  const deadline = Date.now() + Math.max(1, Number(device.expires_in) || 600) * 1000;
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, interval));
    try {
      const token = await request('/auth/token', { method: 'POST', body: { device_code: device.device_code } });
      if (!token?.access_token) throw new Error('Service returned an incomplete login response');
      await saveAuth({ access_token: token.access_token, token_type: token.token_type || 'Bearer', expires_at: new Date(Date.now() + (Number(token.expires_in) || 3600) * 1000).toISOString(), api_base: apiBase() });
      console.log('Login saved locally with owner-only file permissions.');
      return;
    } catch (error) {
      if (error.code === 'authorization_pending') continue;
      throw error;
    }
  }
  throw new Error('Device authorization expired. Run `dsh login` to start again.');
}

async function logout() {
  const auth = await readAuth();
  if (auth?.access_token) {
    if (auth.api_base !== apiBase()) {
      await removeAuth();
      console.log('Removed the local credential. The remote token was not revoked because the configured service URL differs from the login URL.');
      return;
    }
    await request('/auth/logout', { method: 'POST', token: auth.access_token });
  }
  await removeAuth();
  console.log('Logged out.');
}

async function status() {
  const auth = await currentAuth();
  const data = await request('/account', { token: auth.access_token });
  printJson(data);
}

async function models() { printJson(await request('/models', { token: (await currentAuth()).access_token })); }
async function doctor() { printJson(await request('/health')); }
async function tasks() { printJson(await request('/tasks', { token: (await currentAuth()).access_token })); }
async function task(id) {
  if (!id) throw new Error('Usage: dsh task ID');
  printJson(await request(`/tasks/${encodeURIComponent(id)}`, { token: (await currentAuth()).access_token }));
}
async function stopTask(id) {
  if (!id) throw new Error('Usage: dsh stop ID');
  printJson(await request(`/tasks/${encodeURIComponent(id)}/cancel`, { method: 'POST', token: (await currentAuth()).access_token }));
}

function conversation(session) {
  return session.turns.flatMap((turn) => [
    { role: 'user', content: turn.user },
    { role: 'assistant', content: turn.assistant }
  ]);
}

async function oneTurn(session, prompt, { json = false } = {}) {
  return withSessionLock(session.id, async () => {
  session = await loadSession(session.id);
  const auth = await currentAuth();
  if (session.pending_grant) throw new Error(`Task creation for this session is unresolved (idempotency key ${session.pending_grant.idempotency_key}). No additional paid task was created.`);
  if (session.pending_task) {
    const pending = session.pending_task;
    let snapshot;
    try { snapshot = await request(`/tasks/${encodeURIComponent(pending.id)}`, { token: auth.access_token }); }
    catch { throw new Error(`Task ${pending.id} is unresolved. No new paid task was created; check the service and resume after it is terminal with no held budget.`); }
    const state = taskState(snapshot);
    pending.status = state.status;
    pending.held_usd = state.held;
    pending.checked_at = new Date().toISOString();
    if (!state.terminal || state.held !== 0) {
      await saveSession(session);
      throw new Error(`Task ${pending.id} remains ${state.status || 'unresolved'} with held budget ${state.held ?? 'unknown'}. No new paid task was created.`);
    }
    delete session.pending_task;
    await saveSession(session);
  }
  const messages = [...conversation(session), { role: 'user', content: prompt }];
  if (messages.length > 80 || Buffer.byteLength(JSON.stringify(messages), 'utf8') > 110 * 1024) throw new Error('Conversation exceeds the remote context bound. Start /new before creating another task grant.');
  const idempotencyKey = randomUUID();
  const grantRequest = { title: session.title, max_usd: '1', model: process.env.DSHREM_MODEL || 'coding', mode: process.env.DSHREM_MODE || 'single', method: process.env.DSHREM_METHOD || 'evidence-first', idempotency_key: idempotencyKey };
  session.pending_grant = { idempotency_key: idempotencyKey, request: grantRequest, status: 'requesting', created_at: new Date().toISOString() };
  await saveSession(session);
  const grant = await request('/tasks', {
    method: 'POST', token: auth.access_token,
    body: grantRequest
  });
  if (!grant?.id) throw new Error('Service returned a task without an id');
  delete session.pending_grant;
  session.task_ids.push(grant.id);
  session.pending_task = { id: grant.id, prompt, status: 'submitted', expires_at: grant.expires_at ?? null, budget: grant.budget ?? null, created_at: new Date().toISOString() };
  await saveSession(session);
  const controller = new AbortController();
  let interrupted = false;
  const onInterrupt = () => { interrupted = true; controller.abort(); };
  process.once('SIGINT', onInterrupt);
  try {
    const response = await request(`/tasks/${encodeURIComponent(grant.id)}/chat`, {
      method: 'POST', token: auth.access_token, signal: controller.signal,
      timeoutMs: 210_000,
      body: { messages, max_tokens: 2048 }
    });
    const message = response?.choices?.[0]?.message;
    if (!message || typeof message.content !== 'string') throw new Error('Service returned a response without assistant text');
    const turn = { user: prompt, assistant: message.content, task_id: grant.id, usage: response.usage ?? null, cost: response.task ?? null, created_at: new Date().toISOString() };
    if (Array.isArray(message.tool_calls) && message.tool_calls.length) turn.tool_calls = message.tool_calls;
    session.turns.push(turn);
    delete session.pending_task;
    session.updated_at = new Date().toISOString();
    await saveSession(session);
    if (json) printJson({ ...turn, session_id: session.id });
    else {
      console.log(message.content);
      if (turn.tool_calls) console.log('\nThe response includes suggested tool calls. This client displays them and never executes them.');
      if (response.task) console.log(`\nTask spend: ${response.task.spent_usd ?? 'unknown'} USD; held: ${response.task.held_usd ?? 'unknown'} USD`);
    }
  } catch (error) {
    session.pending_task ??= { id: grant.id, prompt, created_at: new Date().toISOString() };
    if (interrupted) {
      try { await request(`/tasks/${encodeURIComponent(grant.id)}/cancel`, { method: 'POST', token: auth.access_token }); } catch { /* Best effort; no retry. */ }
    }
    try {
      const snapshot = await request(`/tasks/${encodeURIComponent(grant.id)}`, { token: auth.access_token });
      const state = taskState(snapshot);
      session.pending_task.status = state.status || 'unknown';
      session.pending_task.held_usd = state.held;
      session.pending_task.last_error = error.message;
      session.pending_task.checked_at = new Date().toISOString();
    } catch { session.pending_task.status = 'unknown'; session.pending_task.last_error = error.message; }
    await saveSession(session);
    if (interrupted) throw new Error('Interrupted. Cancellation was requested; the task id and status were saved locally.');
    throw error;
  } finally { process.removeListener('SIGINT', onInterrupt); }
  return session;
  });
}

function taskState(snapshot) {
  const status = String(snapshot?.status ?? snapshot?.task?.status ?? '').toLowerCase();
  const heldValue = snapshot?.held_usd ?? snapshot?.task?.held_usd ?? snapshot?.budget?.held_usd ?? snapshot?.task?.budget?.held_usd;
  const held = heldValue === undefined || heldValue === null ? null : Number(heldValue);
  return { status, terminal: ['completed', 'complete', 'succeeded', 'failed', 'cancelled', 'canceled', 'expired'].includes(status), held: Number.isFinite(held) ? held : null };
}

async function startSession(initialPrompt, existing = null, { json = false } = {}) {
  let session = existing ?? await createSession(initialPrompt.slice(0, 80) || 'Chat session');
  if (initialPrompt) session = await oneTurn(session, initialPrompt, { json });
  const rl = createInterface({ input: stdin, output: stdout, terminal: Boolean(stdin.isTTY) });
  try {
    while (true) {
      const line = await rl.question('dsh> ');
      const input = line.trim();
      if (!input) continue;
      if (input === '/exit') break;
      if (input === '/help') { console.log('Commands: /help, /new, /cost, /exit'); continue; }
      if (input === '/cost') { printJson(session.turns.map(({ task_id, cost, usage }) => ({ task_id, cost, usage }))); continue; }
      if (input === '/new') { session = await createSession('Chat session'); console.log(`Started local session: ${session.id}`); continue; }
      if (input.startsWith('/')) { console.log('Unknown chat command. Use /help to see available commands.'); continue; }
      session = await oneTurn(session, input);
    }
  } finally { rl.close(); }
  console.log(`Session saved locally: ${session.id}`);
}

async function runTask(args) {
  const json = args.includes('--json');
  const task = args.filter((arg) => arg !== '--json').join(' ').trim();
  if (!task) throw new Error('Usage: dsh run TASK [--json]');
  const session = await createSession(task.slice(0, 80));
  await oneTurn(session, task, { json });
}

async function kb(args) {
  const auth = await currentAuth();
  if (args[0] === 'map') { printJson(await request('/kb/map', { token: auth.access_token })); return; }
  if (args[0] === 'search') {
    const query = args.slice(1).join(' ').trim();
    if (!query) throw new Error('Usage: dsh kb search QUERY');
    printJson(await request('/kb/search', { method: 'POST', token: auth.access_token, body: { query } }));
    return;
  }
  if (args[0] === 'add') {
    if (!args[1] || args.length !== 2) throw new Error('Usage: dsh kb add FILE');
    const absolute = path.resolve(args[1]);
    const label = path.relative(process.cwd(), absolute);
    if (!label || label === '..' || label.startsWith(`..${path.sep}`) || path.isAbsolute(label)) throw new Error('Knowledge files must be inside the current working directory');
    if (/^(?:\.env(?:\..*)?|\.npmrc|\.netrc|id_(?:rsa|ed25519)|.*\.(?:pem|key|p12|pfx))$/i.test(path.basename(label))) throw new Error('Credential and environment files cannot be added');
    const info = await lstat(absolute);
    if (info.isSymbolicLink() || !info.isFile()) throw new Error('Only one explicit regular file can be added; symlinks are not accepted');
    const root = await realpath(process.cwd());
    const actual = await realpath(absolute);
    const realLabel = path.relative(root, actual);
    if (!realLabel || realLabel === '..' || realLabel.startsWith(`..${path.sep}`) || path.isAbsolute(realLabel)) throw new Error('Knowledge files must resolve inside the current working directory');
    if (info.size > 512 * 1024) throw new Error('Knowledge files are limited to 512 KiB');
    const bytes = await readFile(absolute);
    if (bytes.byteLength > 512 * 1024) throw new Error('Knowledge files are limited to 512 KiB');
    const text = bytes.toString('utf8');
    if (text.includes('\0') || text.includes('\uFFFD')) throw new Error('Binary or invalid UTF-8 files cannot be added');
    if (/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/i.test(text) || /(?:^|[^a-z])(?:[a-z0-9_-]*(?:api[_-]?key|auth[_-]?token|access[_-]?token|password|passwd|secret|private[_-]?key|credential)[a-z0-9_-]*)\s*[:=]\s*\S+/im.test(text)) throw new Error('The file appears to contain credentials; it cannot be added');
    printJson(await request('/kb/documents', { method: 'POST', token: auth.access_token, body: { documents: [{ path: realLabel.split(path.sep).join('/'), text }] } }));
    return;
  }
  throw new Error('Usage: dsh kb add FILE | dsh kb search QUERY | dsh kb map');
}

async function pickSession() {
  const sessions = await listSessions();
  if (!sessions.length) throw new Error('No local sessions are available');
  if (!stdin.isTTY) throw new Error('Choose a session id from `dsh sessions`');
  sessions.forEach((session, index) => console.log(`${index + 1}. ${session.title} (${session.id})`));
  const rl = createInterface({ input: stdin, output: stdout });
  try {
    const answer = await rl.question('Resume which session? ');
    const selected = sessions[Number(answer) - 1];
    if (!selected) throw new Error('Invalid session selection');
    return selected.id;
  } finally { rl.close(); }
}

async function reconcileSession(id, cancel = false) {
  return withSessionLock(id, async () => {
    const session = await loadSession(id);
    const auth = await currentAuth();
    if (session.pending_grant) {
      const grant = await request('/tasks', {
        method: 'POST', token: auth.access_token,
        body: session.pending_grant.request || { title: session.title, max_usd: '1', model: 'coding', idempotency_key: session.pending_grant.idempotency_key }
      });
      if (!grant?.id) throw new Error('Idempotent grant recovery returned no task id; the grant key remains saved.');
      session.task_ids.push(grant.id);
      session.pending_task = { id: grant.id, status: 'grant_recovered', expires_at: grant.expires_at ?? null, budget: grant.budget ?? null, created_at: new Date().toISOString() };
      delete session.pending_grant;
      await saveSession(session);
    }
    if (!session.pending_task) throw new Error('This session has no unresolved grant or task to reconcile.');
    const taskId = session.pending_task.id;
    try {
      let snapshot = await request(`/tasks/${encodeURIComponent(taskId)}`, { token: auth.access_token });
      let state = taskState(snapshot);
      if (cancel && !state.terminal) {
        await request(`/tasks/${encodeURIComponent(taskId)}/cancel`, { method: 'POST', token: auth.access_token });
        snapshot = await request(`/tasks/${encodeURIComponent(taskId)}`, { token: auth.access_token });
        state = taskState(snapshot);
      }
      session.pending_task.status = state.status || 'unknown';
      session.pending_task.held_usd = state.held;
      session.pending_task.checked_at = new Date().toISOString();
      if (state.terminal && state.held === 0) delete session.pending_task;
      await saveSession(session);
      printJson({ task_id: taskId, status: state.status || 'unknown', held_usd: state.held, cleared: !session.pending_task });
    } catch (error) {
      session.pending_task.status = 'unknown';
      session.pending_task.last_error = error.message;
      session.pending_task.checked_at = new Date().toISOString();
      await saveSession(session);
      throw new Error(`Task ${taskId} remains unresolved. Its id and latest check status are saved; no inference retry was made.`);
    }
  });
}

export async function main(args) {
  checkNode();
  if (args[0] === '--version' || args[0] === '-v') { console.log(`dshrempub ${VERSION}`); return; }
  if (!args.length) {
    if (stdin.isTTY && stdout.isTTY) {
      try { await currentAuth(); } catch { console.log(HELP); return; }
      return startSession('');
    }
    console.log(HELP); return;
  }
  if (args[0] === '--help' || args[0] === '-h' || args[0] === 'help') { console.log(HELP); return; }
  switch (args[0]) {
    case 'login': return login();
    case 'logout': return logout();
    case 'status': return status();
    case 'models': return models();
    case 'doctor': return doctor();
    case 'tasks': return tasks();
    case 'task': return task(args[1]);
    case 'stop': return stopTask(args[1]);
    case 'sessions': case 'list': return printJson(await listSessions());
    case 'resume': {
      const id = args[1] ?? await pickSession();
      return startSession('', await loadSession(id));
    }
    case 'reconcile': {
      if (!args[1] || args.slice(2).some((arg) => arg !== '--cancel')) throw new Error('Usage: dsh reconcile SESSION_ID [--cancel]');
      return reconcileSession(args[1], args.includes('--cancel'));
    }
    case 'chat': {
      const id = option(args, '--session');
      const session = id ? await loadSession(id) : null;
      return startSession('', session);
    }
    case 'run': return runTask(args.slice(1));
    case 'kb': return kb(args.slice(1));
    default: throw new Error(`Unknown command: ${args[0]} (run dsh --help)`);
  }
}
