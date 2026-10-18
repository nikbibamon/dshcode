// Two separate nodes let a durable graph checkpoint the request id BEFORE I/O.
// No graph runtime or provider SDK is required by this adapter.
import {randomUUID} from 'node:crypto';
import {createRequire} from 'node:module';
const require = createRequire(import.meta.url);
const {createClient} = require('../vscode/lib/client.js');

export function prepareDshrem(state) {
  if (state.dshremRequest) return {dshremRequest: state.dshremRequest};
  if (typeof state.question !== 'string' || !state.question.trim()) throw new Error('question_required');
  return {dshremRequest: {
    idempotencyKey: randomUUID(),
    messages: [{role: 'user', content: state.question}],
    title: 'Workflow code analysis'
  }};
}

export function createDshremNode({token, apiBase, fetchImpl, onTask} = {}) {
  if (typeof token !== 'string' || !token) throw new Error('tenant_token_required');
  const client = createClient({base: apiBase, ...(fetchImpl ? {fetchImpl} : {})});
  return async function dshremNode(state, config = {}) {
    const request = state.dshremRequest;
    if (!request?.idempotencyKey || !Array.isArray(request.messages)) throw new Error('checkpoint_prepare_node_first');
    if (config.signal?.aborted) throw new Error('workflow_cancelled_before_dispatch');
    const answer = await client.ask({
      token, messages: request.messages, idempotencyKey: request.idempotencyKey,
      title: request.title || 'Workflow code analysis', signal: config.signal,
      onGrant: onTask ? grant => onTask({taskId: grant.id, requestId: request.idempotencyKey}) : undefined
    });
    // Credentials stay in the closure, never in checkpointed state or callbacks.
    return {dshremAnswer: {taskId: answer.taskId, text: answer.content,
      evidence: answer.evidence, usage: answer.usage, cost: answer.cost}};
  };
}
