import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareDshrem, createDshremNode} from '../integrations/langgraph.mjs';

test('prepare is local and preserves the checkpointed idempotency key on replay', () => {
  const first = prepareDshrem({question:'explicit code review'});
  assert.equal(prepareDshrem(first).dshremRequest.idempotencyKey, first.dshremRequest.idempotencyKey);
  assert.throws(() => prepareDshrem({}), /question_required/);
});

test('node uses tenant grant and returns evidence/cost without putting token into state', async () => {
  const calls=[], tasks=[];
  const node = createDshremNode({token:'private-tenant-token', onTask:t => tasks.push(t),
    fetchImpl:async (url, init) => {
      calls.push({url, body:JSON.parse(init.body), auth:init.headers.authorization});
      return new Response(JSON.stringify(url.endsWith('/tasks') ? {id:'t1'} :
        {choices:[{message:{content:'review'}}], evidence:[], task:{spent_usd:'0.001',held_usd:'0'}}));
    }});
  const state = prepareDshrem({question:'q'});
  const result = await node(state);
  assert.equal(calls.length,2);
  assert.equal(calls[0].body.idempotency_key,state.dshremRequest.idempotencyKey);
  assert.equal(calls[0].body.max_usd,'1');
  assert.equal(calls[1].auth,'Bearer private-tenant-token');
  assert.equal(result.dshremAnswer.cost.spent_usd,'0.001');
  assert.ok(!JSON.stringify({state,result,tasks}).includes('private-tenant-token'));
});

test('unprepared or cancelled graph cannot create a paid task', async () => {
  const node=createDshremNode({token:'t',fetchImpl:() => assert.fail('no network')});
  await assert.rejects(node({}), /checkpoint_prepare/);
  await assert.rejects(node(prepareDshrem({question:'q'}), {signal:AbortSignal.abort()}), /cancelled/);
});

test('an upstream failure does not silently retry the paid node', async () => {
  let calls=0;
  const node=createDshremNode({token:'t',fetchImpl:async () => {
    calls++;
    return new Response('{}',{status:503});
  }});
  await assert.rejects(node(prepareDshrem({question:'q'})));
  assert.equal(calls,1);
});
