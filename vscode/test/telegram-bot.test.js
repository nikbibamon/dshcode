'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createBot, ownerCommand } = require('../lib/telegram-bot');

const update = (id, text, owner = 123456) => ({ update_id: id, message: { message_id: id, from: { id: owner }, chat: { id: owner, type: 'private' }, text } });
function fixture(failChat = false, options = {}) {
  let state = {};
  const calls = [];
  const bot = createBot({ botToken: '123456:abcdefghijklmnopqrstuvwxyz12345', ownerId: '123456', apiBase: 'https://dsh.tvijo.com/api/dshrem/v1', accessToken: 'test-access-token',
    load: async () => structuredClone(state), save: async next => { state = structuredClone(next); },
    ...options, fetchImpl: async (url, options) => {
      const body = JSON.parse(options.body || '{}'); calls.push({ url, body });
      if (url.endsWith('/getMe')) return Response.json({ ok: true, result: { id: 55, username: 'test_bot' } });
      if (url.endsWith('/sendMessage')) return Response.json({ ok: true, result: {} });
      if (url.endsWith('/tasks')) { assert.ok(state.pending?.request, 'request persisted before paid dispatch'); return Response.json({ id: 'task1' }); }
      if (url.endsWith('/chat')) return failChat ? new Response('', { status: 502 }) : Response.json({ choices: [{ message: { content: 'answer' } }], task: { spent_usd: '.01', held_usd: '0' } });
      if (url.endsWith('/tasks/task1')) return Response.json({ status: 'frozen', budget: { held_usd: '1' } });
      throw new Error('Unexpected test URL');
    } });
  return { bot, calls, state: () => state };
}
test('only configured owner private chat can trigger commands; starting sends no messages', async () => {
  const f = fixture(); await f.bot.start();
  assert.equal(f.calls.length, 1);
  await f.bot.handle(update(1, '/ask forbidden', 999999));
  const group = update(2, '/ask forbidden'); group.message.chat.type = 'group';
  assert.equal(ownerCommand(group, '123456'), null);
  await f.bot.handle(group);
  await f.bot.handle(update(3, '/exec reboot'));
  assert.equal(f.calls.filter(c => c.url.includes('/tasks')).length, 0);
  assert.ok(!JSON.stringify(f.state()).includes('test-access-token'));
  f.bot.stop();
});
test('one owner ask dispatches once and replayed Telegram update creates no extra task', async () => {
  const f = fixture(); await f.bot.start();
  await f.bot.handle(update(1, '/ask explain the evidence'));
  await f.bot.handle(update(1, '/ask explain the evidence'));
  assert.equal(f.calls.filter(c => c.url.endsWith('/tasks')).length, 1);
  assert.equal(f.calls.filter(c => c.url.endsWith('/chat')).length, 1);
  assert.equal(f.state().pending, null);
  assert.equal(f.state().lastRequest.status, 'completed'); f.bot.stop();
});
test('failed paid call is retained and blocks a second task without retrying it', async () => {
  const f = fixture(true); await f.bot.start();
  await f.bot.handle(update(1, '/ask initial question'));
  assert.equal(f.state().pending.taskId, 'task1');
  await f.bot.handle(update(2, '/ask second question'));
  assert.equal(f.calls.filter(c => c.url.endsWith('/tasks')).length, 1);
  assert.equal(f.calls.filter(c => c.url.endsWith('/chat')).length, 1);
  assert.equal(f.state().lastOutcome.code, 'pending_task'); f.bot.stop();
});

test('service restart needs an exact allowlist entry and fresh single-use owner confirmation', async () => {
  const actions=[];
  const f=fixture(false,{allowedServices:['my-worker.service'],executeService:async (action,units)=>{actions.push({action,units});return 'ok';}});
  await f.bot.start();
  await f.bot.handle(update(1,'/restart ssh.service'));
  assert.equal(actions.length,0);
  await f.bot.handle(update(2,'/restart my-worker.service'));
  assert.equal(actions.length,0);
  const first=f.state().confirmation.code;
  await f.bot.handle(update(3,'/confirm wrong'));
  assert.equal(actions.length,0);
  await f.bot.handle(update(4,'/confirm '+first));
  assert.equal(actions.length,0,'invalid confirmation consumes the challenge');
  await f.bot.handle(update(5,'/restart my-worker.service'));
  const code=f.state().confirmation.code;
  await f.bot.handle(update(6,'/confirm '+code));
  assert.deepEqual(actions,[{action:'restart',units:['my-worker.service']}]);
  await f.bot.handle(update(7,'/confirm '+code));
  assert.equal(actions.length,1,'used code never restarts a second time');
  f.bot.stop();
});
