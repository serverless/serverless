'use strict'

import {
  AGENTCORE_INVOKE_ACCEPT_HEADER,
  consumeSseTextStream,
  decodeAgentStreamChunk,
  isDoneSseEvent,
} from '../../../../../../../lib/plugins/aws/bedrock-agentcore/utils/streaming.js'

const toAsyncIterable = (chunks) => ({
  async *[Symbol.asyncIterator]() {
    for (const chunk of chunks) {
      yield chunk
    }
  },
})

describe('streaming utils', () => {
  describe('AGENTCORE_INVOKE_ACCEPT_HEADER', () => {
    test('contains SSE and JSON media types', () => {
      expect(AGENTCORE_INVOKE_ACCEPT_HEADER).toBe(
        'text/event-stream, application/json',
      )
    })
  })

  describe('decodeAgentStreamChunk', () => {
    test('decodes Uint8Array chunks', () => {
      const chunk = new TextEncoder().encode('hello')
      expect(decodeAgentStreamChunk(chunk)).toBe('hello')
    })

    test('decodes nested chunk.bytes payload', () => {
      const chunk = {
        chunk: { bytes: new TextEncoder().encode('from-nested') },
      }
      expect(decodeAgentStreamChunk(chunk)).toBe('from-nested')
    })

    test('decodes bytes payload', () => {
      const chunk = { bytes: new TextEncoder().encode('from-bytes') }
      expect(decodeAgentStreamChunk(chunk)).toBe('from-bytes')
    })

    test('returns string chunks unchanged', () => {
      expect(decodeAgentStreamChunk('already-text')).toBe('already-text')
    })

    test('returns empty string for unknown chunk shapes', () => {
      expect(decodeAgentStreamChunk({ nope: true })).toBe('')
    })
  })

  describe('consumeSseTextStream', () => {
    test('parses SSE events split across chunk boundaries', async () => {
      const chunks = toAsyncIterable([
        'data: hel',
        'lo\n\n',
        'event: custom\n',
        'data: wor',
        'ld\n\n',
      ])

      const events = []
      await consumeSseTextStream(chunks, (event) => {
        events.push({
          event: event.event || null,
          data: event.data,
        })
      })

      expect(events).toEqual([
        { event: null, data: 'hello' },
        { event: 'custom', data: 'world' },
      ])
    })

    test('emits multiple events from a single chunk', async () => {
      const chunks = toAsyncIterable(['data: first\n\ndata: second\n\n'])

      const events = []
      await consumeSseTextStream(chunks, (event) => {
        events.push(event.data)
      })

      expect(events).toEqual(['first', 'second'])
    })
  })

  describe('isDoneSseEvent', () => {
    test('returns true for done event payload', () => {
      expect(isDoneSseEvent('[DONE]')).toBe(true)
      expect(isDoneSseEvent(' [DONE] ')).toBe(true)
    })

    test('returns false for other payloads', () => {
      expect(isDoneSseEvent('done')).toBe(false)
      expect(isDoneSseEvent(null)).toBe(false)
    })
  })
})
