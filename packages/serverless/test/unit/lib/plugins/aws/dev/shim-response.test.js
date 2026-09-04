import { toStreamedResponse } from '../../../../../../lib/plugins/aws/dev/shim-response.js'

describe('toStreamedResponse', () => {
  test('flattens headers and passes a textual body through', () => {
    const { metadata, body } = toStreamedResponse({
      statusCode: 200,
      headers: { 'content-type': 'text/event-stream' },
      body: 'event: message\n\n',
      isBase64Encoded: false,
    })
    expect(metadata).toEqual({
      statusCode: 200,
      headers: { 'content-type': 'text/event-stream' },
    })
    expect(body.toString('utf8')).toBe('event: message\n\n')
  })

  test('flattens multiValueHeaders (REST events make hono emit them) last-value-wins', () => {
    const { metadata } = toStreamedResponse({
      statusCode: 201,
      multiValueHeaders: {
        'content-type': ['text/plain', 'text/event-stream'],
        'x-a': ['1'],
      },
      body: '',
    })
    expect(metadata.headers).toEqual({
      'content-type': 'text/event-stream',
      'x-a': '1',
    })
  })

  test('decodes base64 bodies to bytes', () => {
    const { body } = toStreamedResponse({
      statusCode: 200,
      headers: {},
      body: Buffer.from('binary!').toString('base64'),
      isBase64Encoded: true,
    })
    expect(body.toString('utf8')).toBe('binary!')
  })

  test('turns the disconnected-session sentinel string into a 503', () => {
    const { metadata, body } = toStreamedResponse('Dev Mode Disconnected: …')
    expect(metadata.statusCode).toBe(503)
    expect(metadata.headers['content-type']).toBe('text/plain')
    expect(body.toString('utf8')).toContain('Dev Mode Disconnected')
  })

  test('defaults a shapeless result to an empty 200', () => {
    const { metadata, body } = toStreamedResponse(undefined)
    expect(metadata.statusCode).toBe(200)
    expect(body.length).toBe(0)
  })
})
