'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {createClient} = require('../lib/client');

test('undeclared oversized body is cancelled while streaming, before buffering it all', async () => {
  let produced = 0, cancelled = false;
  const body = new ReadableStream({
    pull(controller) { produced++; controller.enqueue(new Uint8Array(512 * 1024)); },
    cancel() { cancelled = true; }
  });
  const client = createClient({fetchImpl: async () => new Response(body)});
  await assert.rejects(client.request('/test'), e => e.code === 'oversized');
  assert.equal(cancelled, true);
  assert.ok(produced <= 7);
});

test('timeout remains active after headers arrive while body is stalled', async () => {
  const client = createClient({fetchImpl: async (_url, {signal}) => {
    const body = new ReadableStream({start(controller) {
      signal.addEventListener('abort', () => controller.error(new Error('aborted')), {once:true});
    }});
    return new Response(body);
  }});
  await assert.rejects(client.request('/test', {timeoutMs:20}), e => e.code === 'timeout');
});

test('caller cancellation also covers the response body', async () => {
  const abort = new AbortController();
  const client = createClient({fetchImpl: async (_url, {signal}) => {
    const body = new ReadableStream({start(controller) {
      signal.addEventListener('abort', () => controller.error(new Error('aborted')), {once:true});
    }});
    setTimeout(() => abort.abort(), 10);
    return new Response(body);
  }});
  await assert.rejects(client.request('/test', {signal:abort.signal}), e => e.code === 'interrupted');
});
