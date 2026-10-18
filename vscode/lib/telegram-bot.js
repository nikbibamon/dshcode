'use strict';

const os = require('node:os');
const { randomBytes } = require('node:crypto');
const { execFile } = require('node:child_process');
const core = require('./client');

function systemService(action, units) {
  const args = action === 'status' ? ['show', '--no-pager', '--property=Id,ActiveState,SubState', '--', ...units] : ['restart', '--', units[0]];
  return new Promise((resolve, reject) => execFile('systemctl', args, { timeout: 10_000, maxBuffer: 8192, encoding: 'utf8' }, (error, stdout) => error ? reject(new Error('Service command failed; check local permissions.')) : resolve(stdout || 'Restart command completed.')));
}

function ownerCommand(update, owner) {
  const message = update?.message;
  if (message?.chat?.type !== 'private' || String(message.from?.id) !== String(owner) || String(message.chat.id) !== String(owner)) return null;
  if (typeof message.text !== 'string' || Buffer.byteLength(message.text) > 16000) return null;
  const match = message.text.trim().match(/^\/(\w+)(?:@\w+)?(?:\s+([\s\S]*))?$/);
  return match ? { name: match[1].toLowerCase(), argument: match[2]?.trim() || '', message } : null;
}

function createBot({ botToken, ownerId, apiBase, accessToken, load = async () => ({}), save = async () => {}, fetchImpl = globalThis.fetch, withAction = async action => action(), allowedServices = [], executeService = systemService }) {
  if (!/^\d+:[A-Za-z0-9_-]{20,}$/.test(botToken || '') || !/^[1-9]\d{4,19}$/.test(String(ownerId))) throw new Error('Use a valid BotFather token and numeric owner Telegram ID.');
  if (!Array.isArray(allowedServices) || allowedServices.length > 20 || allowedServices.some(unit => typeof unit !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_.@-]{0,127}\.service$/.test(unit))) throw new Error('Allowlist up to 20 exact systemd .service names.');
  const client = core.createClient({ base: apiBase, fetchImpl });
  let running = false;
  let pollAbort;
  let askAbort;
  let state;
  const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));
  async function telegram(method, body, signal) {
    const controller = new AbortController();
    const abort = () => controller.abort();
    signal?.addEventListener('abort', abort, { once: true });
    const timer = setTimeout(abort, 30_000);
    try {
      const response = await fetchImpl(`https://api.telegram.org/bot${botToken}/${method}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal: controller.signal, redirect: 'error' });
      if (!response.ok) throw new Error('Telegram request refused; check bot ownership and token.');
      const text = await response.text();
      if (Buffer.byteLength(text) > 1024 * 1024) throw new Error('Telegram response exceeded its bound.');
      const data = JSON.parse(text);
      if (!data.ok) throw new Error('Telegram request was not accepted.');
      return data.result;
    } catch { throw new Error('Telegram connection failed. Token values are not logged.'); }
    finally { clearTimeout(timer); signal?.removeEventListener('abort', abort); }
  }
  async function reply(chat, text) {
    // No parse_mode: model text and user-controlled strings cannot become Telegram HTML.
    const chunks = String(text).match(/[\s\S]{1,3500}/g) || [''];
    for (const chunk of chunks.slice(0, 8)) await telegram('sendMessage', { chat_id: chat, text: chunk });
  }
  async function pendingTask() {
    if (!state.pending) return;
    if (state.pending.apiBase && state.pending.apiBase !== client.base) throw new core.ServiceError('pending_task', 'Reconcile the pending task at its original service URL first.');
    if (!state.pending.taskId) throw new core.ServiceError('pending_task', 'An earlier grant may exist. Use /cancel to reconcile it before asking again.');
    const snapshot = await client.taskState(accessToken, state.pending.taskId);
    if (core.pendingBlocks(snapshot)) throw new core.ServiceError('pending_task', 'A previous task is unresolved. Use /cancel; no new paid task was created.');
    state.pending = null; await save(state);
  }
  async function handle(update) {
    const command = ownerCommand(update, ownerId);
    if (!command) return;
    if (Number.isInteger(state.offset) && update.update_id < state.offset) return;
    state.pending = (await load())?.pending || null;
    const { name, argument, message } = command;
    // Retain the request before dispatch and advance the cursor without automatic paid retries.
    state.lastRequest = { updateId: update.update_id, messageId: message.message_id, text: message.text, status: 'accepted', at: new Date().toISOString() };
    state.offset = update.update_id + 1; await save(state);
    try {
      let text;
      if (name === 'start' || name === 'help') text = 'Tvijo DSHREM — private owner-only connector\n/status — read-only host status\n/services — authorized systemd service status\n/restart NAME.service — request restart\n/confirm CODE — approve within 60 seconds\n/account — credit and holds\n/models — available models\n/model ds41f — choose model\n/mode single|auto|council\n/ask your question — one task, $1 cap\n/cancel — cancel/reconcile pending task\nNo arbitrary shell commands or automatic paid retries. Payments are not collected in this bot.';
      else if (name === 'status') text = JSON.stringify({ host: os.hostname(), uptime_seconds: Math.round(os.uptime()), cpu_count: os.cpus().length, load: os.loadavg(), available_memory_bytes: os.freemem(), total_memory_bytes: os.totalmem(), model: state.model || 'coding', mode: state.mode || 'single', pending_task: state.pending?.taskId || null, last_status: state.lastOutcome || null }, null, 2);
      else if (name === 'services') text = allowedServices.length ? await executeService('status', allowedServices) : 'No services authorized. Add exact service names to tvijo.telegram.allowedServices on this host.';
      else if (name === 'restart') {
        if (!allowedServices.includes(argument)) throw new core.ServiceError('service_not_allowed', 'This service is not authorized in the local allowlist.');
        state.confirmation = { unit: argument, code: randomBytes(4).toString('hex'), expires: Date.now() + 60_000 };
        await save(state); text = `Restart ${argument}? Send /confirm ${state.confirmation.code} within 60 seconds. No command has run yet.`;
      } else if (name === 'confirm') {
        const confirmation = state.confirmation;
        state.confirmation = null; await save(state);
        if (!confirmation || confirmation.expires < Date.now() || confirmation.code !== argument || !allowedServices.includes(confirmation.unit)) throw new core.ServiceError('confirmation_required', 'Confirmation expired or is invalid. Request /restart again.');
        text = await executeService('restart', [confirmation.unit]);
      } else if (name === 'account') text = JSON.stringify(await client.account(accessToken), null, 2);
      else if (name === 'models' || name === 'model') {
        const models = await client.request('/models', { token: accessToken });
        if (name === 'model') {
          if (!models.data?.some(item => item.id === argument && item.enabled)) throw new core.ServiceError('model_unavailable', 'That model is not activated. Use /models.');
          state.model = argument; await save(state); text = 'Model selected: ' + argument;
        } else text = models.data.map(item => `${item.id}: ${item.enabled ? 'activated' : 'unavailable'}`).join('\n');
      } else if (name === 'mode') {
        if (!['single', 'auto', 'council'].includes(argument)) throw new core.ServiceError('mode', 'Use /mode single, /mode auto or /mode council.');
        state.mode = argument; await save(state); text = 'Mode selected: ' + argument + '. All calls share the same $1 task cap.';
      } else if (name === 'cancel') {
        if (state.pending?.apiBase && state.pending.apiBase !== client.base) throw new core.ServiceError('pending_task', 'Reconcile the pending task at its original service URL first.');
        if (state.pending && !state.pending.taskId) {
          const grant = await client.request('/tasks', { token: accessToken, method: 'POST', body: state.pending.request });
          state.pending.taskId = grant.id; await save(state);
        }
        if (!state.pending?.taskId) text = 'No pending task.';
        else {
          await client.cancel(accessToken, state.pending.taskId);
          const snapshot = await client.taskState(accessToken, state.pending.taskId);
          text = JSON.stringify(snapshot);
          if (!core.pendingBlocks(snapshot)) { state.pending = null; await save(state); }
        }
      } else if (name === 'ask') {
        if (!argument) throw new core.ServiceError('question', 'Use /ask followed by your question.');
        await pendingTask();
        const idempotencyKey = `tg-${state.botId}-${message.chat.id}-${message.message_id}`;
        const title = 'Telegram: ' + argument.slice(0, 80);
        const model = state.model || 'coding'; const mode = state.mode || 'single'; const method = state.method || 'evidence-first';
        state.pending = { idempotencyKey, apiBase: client.base, taskId: null, request: { title, max_usd: '1', model, mode, method, idempotency_key: idempotencyKey } };
        await save(state); askAbort = new AbortController();
        const answer = await client.ask({ token: accessToken, messages: [{ role: 'user', content: argument }], idempotencyKey, title, model, mode, method, signal: askAbort.signal,
          onGrant: async grant => { state.pending.taskId = grant.id; await save(state); } });
        text = core.formatAnswer({ question: argument, answer }); state.pending = null; state.lastOutcome = { taskId: answer.taskId, status: 'completed', cost: answer.cost }; await save(state);
      } else text = 'Unknown command. Use /help.';
      state.lastRequest.status = 'completed'; await save(state); await reply(message.chat.id, text);
    } catch (error) {
      state.lastRequest.status = 'failed'; state.lastOutcome = { status: 'failed', taskId: state.pending?.taskId || null, code: error instanceof core.ServiceError ? error.code : 'connector_failure' }; await save(state);
      await reply(message.chat.id, error instanceof core.ServiceError ? error.message : 'Connector action failed. The request is retained; no paid retry was made.');
    } finally { askAbort = null; }
  }
  return {
    async start() {
      if (running) return;
      state = await load() || {}; state.confirmation = null;
      const me = await telegram('getMe', {}); state.botId = me.id; state.username = me.username; await save(state);
      running = true;
      return { username: me.username };
    },
    async poll() {
      let errors = 0;
      while (running) {
        try {
          pollAbort = new AbortController();
          const updates = await telegram('getUpdates', { offset: state.offset || 0, timeout: 20, limit: 10, allowed_updates: ['message'] }, pollAbort.signal);
          for (const update of updates) {
            if (!running) break;
            if (ownerCommand(update, ownerId)) await withAction(() => handle(update));
            else { state.offset = update.update_id + 1; await save(state); }
          }
          errors = 0;
        } catch {
          if (!running) break;
          if (++errors >= 3) { running = false; throw new Error('Telegram connector stopped after three connection failures. Retained requests were not retried.'); }
          await wait(5000 * errors);
        }
      }
    },
    stop() { running = false; pollAbort?.abort(); askAbort?.abort(); },
    handle: update => withAction(() => handle(update)),
    get running() { return running; }
  };
}

module.exports = { createBot, ownerCommand };
