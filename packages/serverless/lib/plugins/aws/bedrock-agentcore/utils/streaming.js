'use strict'

import { createParser } from 'eventsource-parser'

export const AGENTCORE_INVOKE_ACCEPT_HEADER =
  'text/event-stream, application/json'

/**
 * Decode a chunk from AgentCore runtime stream into text.
 * Supports raw SDK chunks and nested bytes shapes returned by some SDK clients.
 */
export function decodeAgentStreamChunk(chunk, decoder = new TextDecoder()) {
  if (typeof chunk === 'string') {
    return chunk
  }

  if (chunk instanceof Uint8Array || Buffer.isBuffer(chunk)) {
    return decoder.decode(chunk, { stream: true })
  }

  if (chunk?.chunk?.bytes) {
    return decoder.decode(chunk.chunk.bytes, { stream: true })
  }

  if (chunk?.bytes) {
    return decoder.decode(chunk.bytes, { stream: true })
  }

  return ''
}

/**
 * Parse SSE text chunks and emit events to the callback.
 * Callback receives objects with { event, data } shape.
 */
export async function consumeSseTextStream(textChunkAsyncIterable, onEvent) {
  let callbackPromise = Promise.resolve()

  const parser = createParser({
    onEvent(event) {
      callbackPromise = callbackPromise.then(() => onEvent(event))
    },
  })

  for await (const chunk of textChunkAsyncIterable) {
    if (!chunk) continue
    parser.feed(chunk)
  }

  await callbackPromise
}

export function isDoneSseEvent(data) {
  return typeof data === 'string' && data.trim() === '[DONE]'
}
