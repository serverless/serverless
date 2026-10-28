import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import {
  FRAME_OVERHEAD_BYTES,
  KIND,
  MAX_MESSAGE_BYTES,
  PROTOCOL_VERSION,
  STREAM_CHUNK_BYTES,
  WEB_BODY_BYTES,
  bridgeClientId,
  createOpener,
  createSealer,
  decodeFrame,
  decodeSessionKey,
  encodeFrame,
  fitsOneMessage,
  laptopClientId,
  openRaw,
  sealRaw,
  topicsOf,
} from '../../../../../../../lib/plugins/aws/dev/relay/protocol.js'

const here = path.dirname(fileURLToPath(import.meta.url))
// The same file the bridge's Go tests read: both sides must seal byte for byte alike.
const VECTORS = path.join(
  here,
  '../../../../../../../../../dev-mode-bridge/internal/protocol/testdata/vectors.json',
)
const vectors = JSON.parse(fs.readFileSync(VECTORS, 'utf8'))
const key = decodeSessionKey(vectors.keyBase64)

describe('the relay wire format', () => {
  test('the constants are the ones the bridge uses', () => {
    expect(PROTOCOL_VERSION).toBe(1)
    expect(MAX_MESSAGE_BYTES).toBe(129024)
    expect(STREAM_CHUNK_BYTES).toBe(102400)
    expect(FRAME_OVERHEAD_BYTES).toBe(33)
    expect(WEB_BODY_BYTES).toBe(65536)
    expect(Object.isFrozen(KIND)).toBe(true)
    expect(KIND).toEqual({
      INVOKE: 'invoke',
      UPLOAD_URL_REQUEST: 'upload_url_request',
      ACCEPTED: 'accepted',
      RESPONSE: 'response',
      ERROR: 'error',
      INIT_ERROR: 'init_error',
      STREAM_START: 'stream_start',
      STREAM_DATA: 'stream_data',
      STREAM_END: 'stream_end',
      EXPIRED: 'expired',
      NOT_IN_DEV: 'not_in_dev',
      NEED_ENVIRONMENT: 'need_environment',
      UPLOAD_URL: 'upload_url',
      GONE: 'gone',
      PAYLOAD: 'payload',
      PASSED: 'passed',
      REQUEST: 'request',
      RESPONSE_START: 'response_start',
    })
  })

  test('a web request and its response start fit one message with room for the headers', () => {
    const request = {
      kind: KIND.REQUEST,
      env: 'e0123456789ab',
      fn: 'svc-dev-web',
      id: 'r0123456789abcdef',
      sentAt: 1_700_000_000_000,
      method: 'POST',
      path: '/upload',
      headers: { 'content-type': 'application/octet-stream' },
    }
    expect(fitsOneMessage(request, Buffer.alloc(WEB_BODY_BYTES))).toBe(true)
    const seal = createSealer({ key: Buffer.alloc(32, 1) })
    const open = createOpener({ key: Buffer.alloc(32, 1) })
    const start = {
      kind: KIND.RESPONSE_START,
      id: request.id,
      status: 200,
      headers: { 'set-cookie': ['a=1', 'b=2'] },
    }
    const opened = open('t', seal('t', start))
    expect(opened.header).toEqual(start)
  })

  test('the shared vector of a count report decodes to its header and body', () => {
    const v = vectors.vectors.find((vector) => vector.name === 'passed counts')
    const opened = openRaw({
      key,
      topic: v.topic,
      message: Buffer.from(v.messageHex, 'hex'),
    })
    const frame = decodeFrame(opened.plaintext)
    expect(frame.header).toEqual({ kind: KIND.PASSED, env: 'e0123456789ab' })
    expect(JSON.parse(frame.body.toString('utf8'))).toEqual({
      since: 1_790_000_000_000,
      counts: [{ fn: 'svc-dev-api', reason: 'offline', n: 3 }],
    })
  })

  test.each(vectors.vectors.map((v) => [v.name, v]))(
    'seals the shared vector "%s" exactly as the bridge does',
    (_name, v) => {
      const sealed = sealRaw({
        key,
        nonce: Buffer.from(v.nonceHex, 'hex'),
        seq: v.seq,
        topic: v.topic,
        plaintext: Buffer.from(v.plaintextBase64, 'base64'),
      })
      expect(sealed.toString('hex')).toBe(v.messageHex)
    },
  )

  test.each(vectors.vectors.map((v) => [v.name, v]))(
    'opens the shared vector "%s"',
    (_name, v) => {
      const opened = openRaw({
        key,
        topic: v.topic,
        message: Buffer.from(v.messageHex, 'hex'),
      })
      expect(opened.seq).toBe(v.seq)
      expect(opened.nonce.toString('hex')).toBe(v.nonceHex)
      expect(opened.plaintext.toString('base64')).toBe(v.plaintextBase64)
      expect(decodeFrame(opened.plaintext).header.kind).toEqual(
        expect.any(String),
      )
    },
  )

  test('refuses another topic, a changed byte, a changed sequence number, another version, another key and a short message', () => {
    const v = vectors.vectors[0]
    const message = Buffer.from(v.messageHex, 'hex')
    const changed = (at) => {
      const copy = Buffer.from(message)
      copy[at] ^= 1
      return copy
    }
    expect(openRaw({ key, topic: `${v.topic}x`, message })).toBeNull()
    expect(
      openRaw({ key, topic: v.topic, message: changed(message.length - 20) }),
    ).toBeNull()
    expect(openRaw({ key, topic: v.topic, message: changed(4) })).toBeNull()
    expect(openRaw({ key, topic: v.topic, message: changed(10) })).toBeNull()
    expect(
      openRaw({ key, topic: v.topic, message: changed(message.length - 1) }),
    ).toBeNull()
    const other = Buffer.from(message)
    other[0] = PROTOCOL_VERSION + 1
    expect(openRaw({ key, topic: v.topic, message: other })).toBeNull()
    expect(
      openRaw({ key: Buffer.alloc(32), topic: v.topic, message }),
    ).toBeNull()
    expect(
      openRaw({
        key,
        topic: v.topic,
        message: message.subarray(0, FRAME_OVERHEAD_BYTES - 1),
      }),
    ).toBeNull()
  })

  test('opening never throws, whatever arrives', () => {
    const v = vectors.vectors[0]
    const message = Buffer.from(v.messageHex, 'hex')
    const open = createOpener({ key })
    for (const junk of [
      undefined,
      null,
      42,
      {},
      'text',
      Buffer.alloc(0),
      Buffer.alloc(FRAME_OVERHEAD_BYTES, 1),
    ]) {
      expect(openRaw({ key, topic: v.topic, message: junk })).toBeNull()
      expect(open(v.topic, junk)).toBeNull()
    }
    expect(
      openRaw({ key: Buffer.alloc(16), topic: v.topic, message }),
    ).toBeNull()
    expect(openRaw({ key: undefined, topic: v.topic, message })).toBeNull()
    expect(openRaw({ key, topic: undefined, message })).toBeNull()
    // A frame that opens but whose plaintext is not a header line and a body is no frame.
    const sealedJunk = sealRaw({
      key,
      nonce: Buffer.alloc(12, 9),
      seq: 1,
      topic: 't',
      plaintext: Buffer.from('not json\n'),
    })
    expect(open('t', sealedJunk)).toBeNull()
  })

  test('a sealer counts per topic and an opener drops copies', () => {
    const seal = createSealer({ key })
    const open = createOpener({ key })
    const first = seal('a', { kind: KIND.ACCEPTED, id: 'r1' })
    const second = seal('a', { kind: KIND.ACCEPTED, id: 'r2' })
    const other = seal('b', { kind: KIND.ACCEPTED, id: 'r3' })
    expect(open('a', first)).toMatchObject({ seq: 1, header: { id: 'r1' } })
    expect(open('a', second)).toMatchObject({ seq: 2 })
    expect(open('b', other)).toMatchObject({ seq: 1 })
    expect(open('a', first)).toBeNull()
  })

  test('a sealer takes a fresh nonce for every frame', () => {
    const nonces = []
    const seal = createSealer({
      key,
      randomBytes: (size) => {
        const nonce = Buffer.alloc(size, nonces.length + 1)
        nonces.push(nonce)
        return nonce
      },
    })
    const sealed = [
      seal('a', { kind: KIND.GONE }),
      seal('a', { kind: KIND.GONE }),
    ]
    expect(nonces.map((nonce) => nonce.length)).toEqual([12, 12])
    expect(sealed.map((m) => m.subarray(5, 17))).toEqual(nonces)
  })

  test('an opener remembers a bounded number of nonces', () => {
    const seal = createSealer({ key })
    const open = createOpener({ key, remember: 2 })
    const [a, b, c] = ['r1', 'r2', 'r3'].map((id) =>
      seal('t', { kind: KIND.ACCEPTED, id }),
    )
    expect(open('t', a)).not.toBeNull()
    expect(open('t', b)).not.toBeNull()
    expect(open('t', c)).not.toBeNull()
    // The oldest nonce was forgotten, the last two are still remembered.
    expect(open('t', c)).toBeNull()
    expect(open('t', b)).toBeNull()
    expect(open('t', a)).toMatchObject({ header: { id: 'r1' } })
  })

  test('a frame fits one message up to exactly the limit', () => {
    const header = { kind: KIND.RESPONSE, id: 'r' }
    const room =
      MAX_MESSAGE_BYTES -
      FRAME_OVERHEAD_BYTES -
      Buffer.byteLength(JSON.stringify(header)) -
      1
    expect(fitsOneMessage(header, Buffer.alloc(room))).toBe(true)
    expect(fitsOneMessage(header, Buffer.alloc(room + 1))).toBe(false)
    expect(
      sealRaw({
        key,
        nonce: Buffer.alloc(12),
        seq: 1,
        topic: 't',
        plaintext: encodeFrame(header, Buffer.alloc(room)),
      }).length,
    ).toBe(MAX_MESSAGE_BYTES)
  })

  test('a header counts in bytes, not characters', () => {
    const header = { kind: KIND.RESPONSE, id: 'ż' }
    const room =
      MAX_MESSAGE_BYTES -
      FRAME_OVERHEAD_BYTES -
      Buffer.byteLength(JSON.stringify(header)) -
      1
    expect(fitsOneMessage(header, Buffer.alloc(room))).toBe(true)
    expect(fitsOneMessage(header, Buffer.alloc(room + 1))).toBe(false)
  })

  test('a body may contain newlines and zero bytes; a plaintext without a header line is no frame', () => {
    const body = Buffer.from([10, 0, 10, 255])
    expect(
      decodeFrame(encodeFrame({ kind: KIND.STREAM_DATA, n: 0 }, body)).body,
    ).toEqual(body)
    expect(decodeFrame(encodeFrame({ kind: KIND.GONE })).body).toHaveLength(0)
    expect(decodeFrame(Buffer.from('no newline'))).toBeNull()
    expect(decodeFrame(Buffer.from('{"no":"kind"}\n'))).toBeNull()
    expect(decodeFrame(Buffer.from('null\n'))).toBeNull()
    expect(decodeFrame(Buffer.from('["kind"]\n'))).toBeNull()
    expect(decodeFrame(Buffer.from('{"kind":1}\n'))).toBeNull()
  })

  test('a nonce is 12 bytes', () => {
    for (const size of [0, 11, 13]) {
      expect(() =>
        sealRaw({
          key,
          nonce: Buffer.alloc(size),
          seq: 1,
          topic: 't',
          plaintext: Buffer.alloc(0),
        }),
      ).toThrow(TypeError)
    }
  })

  test('the session key is 32 bytes of base64', () => {
    expect(() => decodeSessionKey('')).toThrow(TypeError)
    expect(() => decodeSessionKey(undefined)).toThrow(TypeError)
    expect(() => decodeSessionKey(Buffer.alloc(31).toString('base64'))).toThrow(
      TypeError,
    )
    expect(() => decodeSessionKey(Buffer.alloc(33).toString('base64'))).toThrow(
      TypeError,
    )
    // Characters outside the base64 alphabet are refused, not skipped (the bridge refuses them).
    expect(() => decodeSessionKey(`!${vectors.keyBase64}`)).toThrow(TypeError)
    expect(() => decodeSessionKey(` ${vectors.keyBase64}`)).toThrow(TypeError)
    expect(() =>
      decodeSessionKey(Buffer.alloc(32, 0xff).toString('base64url')),
    ).toThrow(TypeError)
    expect(
      decodeSessionKey(Buffer.alloc(32, 1).toString('base64')),
    ).toHaveLength(32)
  })

  test('topics and client ids stay under the sls-dev prefix the broker role allows', () => {
    const topics = topicsOf('s_0123456789ab')
    expect(topics.up).toBe('sls-dev/s_0123456789ab/up')
    expect(topics.down('e0123456789ab')).toBe(
      'sls-dev/s_0123456789ab/down/e0123456789ab',
    )
    expect(topics.gone).toBe('sls-dev/s_0123456789ab/gone')
    expect(topics.ping).toBe('sls-dev/s_0123456789ab/ping')
    expect(laptopClientId('s_0123456789ab')).toBe('sls-dev-s_0123456789ab-cli')
    expect(bridgeClientId('s_0123456789ab', 'e0123456789ab')).toBe(
      'sls-dev-s_0123456789ab-e0123456789ab',
    )
    // AWS IoT Core: at most 7 slashes and 256 bytes per topic.
    expect(
      topics.down('e0123456789ab').split('/').length - 1,
    ).toBeLessThanOrEqual(7)
  })

  // Field names agree across languages (dev-mode-bridge/internal/protocol/frame_test.go holds the
  // same two constants).
  test('headers cross between the CLI and the bridge', () => {
    const sealedByTheBridge =
      '0100000009000102030405060708090a0b3c20bd72ab81e021af33f2f8c186161ee6f4ab16991f7d461a15c7a93f0a6fdc7575c088fbb862fd569e5d99edff5c179e3501e434f48ff84ca4082363c19e8b891efc58b8f30a437b31de4cd5ad69ca14a8ad071a06270ddfc7bca85a8d95afbe883589c525ea20e53e4bc024571b5dcf454e8988a05cb877dd3cffa0ca4c7acf3e4db596edf26338d1789140a746ab7105da714cdc973171df91705aeb2f'
    const sealedByTheCLI =
      '0100000003ffeeddccbbaa998877665544a56463622391c2f92b1f193f54fdcf7eae81e144144164638c1be7c646bcbb5bb100e1719f733f66fd44af967742656c2f44b3cebe7ad3c6cf'
    expect(
      createOpener({ key })('t', Buffer.from(sealedByTheBridge, 'hex')),
    ).toEqual({
      header: {
        kind: 'response',
        id: 'r',
        contentType: 'text/plain',
        s3: { key: 'k', get: 'g', delete: 'd' },
        upload: { url: 'u', key: 'k2', ttlMs: 900000 },
      },
      body: Buffer.alloc(0),
      seq: 9,
    })
    expect(
      sealRaw({
        key,
        nonce: Buffer.from('ffeeddccbbaa998877665544', 'hex'),
        seq: 3,
        topic: 't',
        plaintext: encodeFrame({ kind: KIND.STREAM_END, id: 'r', count: 0 }),
      }).toString('hex'),
    ).toBe(sealedByTheCLI)
  })
})
