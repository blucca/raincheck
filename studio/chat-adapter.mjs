// AG Studio 3.0.0: text + client tools over a same-origin OpenAI-compatible proxy.
// ponytail: whole-turn buffering for the internal prototype; add provider SSE for live token rendering.
export function toChatRequest(request, model) {
  const messages = request.instructions ? [{ role: 'system', content: request.instructions }] : [];
  for (const item of request.input) {
    if (item.type === 'reasoning') continue;
    if (item.type === 'message') {
      const content = item.content.map(part => {
        if (part.type === 'text') return part.text;
        if (part.type === 'refusal') return part.refusal;
        throw new Error('This prototype accepts text messages.');
      }).join('\n');
      messages.push({ role: item.role, content });
    } else if (item.type === 'function_call') {
      let message = messages.at(-1);
      if (message?.role !== 'assistant') {
        message = { role: 'assistant', content: null };
        messages.push(message);
      }
      (message.tool_calls ??= []).push({
        id: item.callId, type: 'function',
        function: { name: item.name, arguments: item.arguments },
      });
    } else if (item.type === 'function_call_output') {
      messages.push({ role: 'tool', tool_call_id: item.callId, content: item.output });
    } else {
      throw new Error(`Unsupported Studio input: ${item.type}`);
    }
  }
  const body = { model, messages, stream: false };
  if (request.tools?.length) {
    body.tools = request.tools.map(tool => {
      if (tool.kind === 'provided') throw new Error('Provider-hosted tools require their provider mapping.');
      return { type: 'function', function: {
        name: tool.name, description: tool.description, parameters: tool.parameters,
      } };
    });
    body.tool_choice = typeof request.toolChoice === 'object'
      ? { type: 'function', function: { name: request.toolChoice.name } }
      : request.toolChoice ?? 'auto';
  }
  if (request.responseFormat?.type === 'json') {
    const { name, description, schema } = request.responseFormat;
    body.response_format = { type: 'json_schema', json_schema: { name, description, schema, strict: false } };
  }
  return body;
}

export function fromChatResponse(response) {
  const choice = response.choices?.[0];
  if (!choice?.message) throw new Error(response.error?.message ?? 'Model response has no assistant choice.');
  const message = choice.message;
  const id = response.id ?? `response-${crypto.randomUUID()}`;
  const output = [];
  if (message.content) output.push({
    id: `${id}-message`, kind: 'output', type: 'message', role: 'assistant', status: 'completed',
    content: [{ type: 'text', text: message.content, annotations: [] }],
  });
  for (const call of message.tool_calls ?? []) output.push({
    id: call.id, kind: 'output', type: 'function_call', callId: call.id,
    name: call.function.name, arguments: call.function.arguments, status: 'completed',
  });
  const incomplete = ['length', 'content_filter'].includes(choice.finish_reason);
  return {
    id, createdAt: response.created ? response.created * 1000 : Date.now(), output,
    status: incomplete ? 'incomplete' : 'completed',
    ...(incomplete ? { incompleteDetails: { reason: choice.finish_reason === 'length' ? 'max_output_tokens' : 'content_filter' } } : {}),
    ...(response.usage ? { usage: {
      inputTokens: response.usage.prompt_tokens, outputTokens: response.usage.completion_tokens,
      totalTokens: response.usage.total_tokens,
    } } : {}),
    model: response.model,
  };
}

// Backend contract: accept AgLlmRequest, return the provider's Chat Completion JSON.
// The server uses toChatRequest(request, configuredModel) before calling its private provider.
export function proxyAdapter(endpoint) {
  return {
    executeTurn(request, options = {}) {
      const complete = fetch(endpoint, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request), signal: options.signal,
      }).then(async response => {
        if (!response.ok) throw new Error(`Studio model request failed (${response.status}).`);
        return fromChatResponse(await response.json());
      });
      return {
        complete,
        stream: { async *[Symbol.asyncIterator]() {
          const response = await complete;
          for (const item of response.output) {
            if (item.type === 'message') {
              yield { type: 'TEXT_MESSAGE_START', messageId: item.id, role: 'assistant' };
              yield { type: 'TEXT_MESSAGE_CONTENT', messageId: item.id, delta: item.content.map(part => part.text).join('') };
              yield { type: 'TEXT_MESSAGE_END', messageId: item.id };
            } else if (item.type === 'function_call') {
              yield { type: 'TOOL_CALL_START', toolCallId: item.callId, toolCallName: item.name };
              yield { type: 'TOOL_CALL_ARGS', toolCallId: item.callId, delta: item.arguments };
              yield { type: 'TOOL_CALL_END', toolCallId: item.callId };
            }
          }
        } },
      };
    },
  };
}
