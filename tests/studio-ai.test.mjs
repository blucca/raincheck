import test from 'node:test';
import assert from 'node:assert/strict';
import { LiveInterpreter } from '../src/interpreter.mjs';
import { toChatRequest, fromChatResponse, proxyAdapter } from '../studio/chat-adapter.mjs';

test('Studio tools use the shared budgeted model path and return native tool events', async () => {
  const input = [
    { type: 'message', role: 'user', content: [{ type: 'text', text: 'Show the families sharing the last Sunday place.' }] },
    { type: 'function_call', callId: 'snapshot-1', name: 'read_batch_snapshot', arguments: '{}' },
    { type: 'function_call_output', callId: 'snapshot-1', output: '{"available":1,"requested":2}' },
  ];
  const request = { ...toChatRequest({ input, tools: [{ name: 'add_page_filter',
    description: 'Filter the family page', parameters: { type: 'object' } }] }, 'test-model'), max_tokens: 1800 };
  assert.equal(request.messages[1].tool_calls[0].id, 'snapshot-1');
  assert.equal(request.messages[2].tool_call_id, 'snapshot-1');
  const fixture = { id: 'response-1', choices: [{ finish_reason: 'tool_calls', message: {
    content: null, tool_calls: [{ id: 'filter-1', type: 'function',
      function: { name: 'add_page_filter', arguments: '{"session":"s-sun18"}' } }],
  } }] };
  const order = [];
  const model = new LiveInterpreter({ apiKey: 'test-key', baseUrl: 'https://model.example', model: 'test-model',
    reserve({ request: outgoing }) { order.push('reserve'); assert.deepEqual(outgoing, request); return { reservationId: 1 }; },
    async fetchImpl(url, options) {
      order.push('http');
      assert.equal(url, 'https://model.example/chat/completions');
      assert.deepEqual(JSON.parse(options.body), request);
      return { ok: true, status: 200, json: async () => fixture };
    },
  });
  const payload = await model.complete(request);
  assert.deepEqual(order, ['reserve', 'http']);
  assert.equal(fromChatResponse(payload).output[0].name, 'add_page_filter');
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => ({ ok: true, json: async () => payload });
    const handler = proxyAdapter('/api/studio/llm').executeTurn({ input });
    const events = [];
    for await (const event of handler.stream) events.push(event.type);
    assert.deepEqual(events, ['TOOL_CALL_START', 'TOOL_CALL_ARGS', 'TOOL_CALL_END']);
    assert.equal((await handler.complete).output[0].callId, 'filter-1');
  } finally { globalThis.fetch = originalFetch; }
});
