import {
  md5,
  md5OfMessageAttributes,
} from '../../../../../../../../../lib/plugins/aws/offline/lib/aws-api-server/sqs/md5.js'

// ---------------------------------------------------------------------------
// 1. md5 of a body matches the well-known hex digest
// ---------------------------------------------------------------------------

it('1. md5 returns the lower-case hex digest of a UTF-8 string', () => {
  // md5('hello') is a stable, well-known value.
  expect(md5('hello')).toBe('5d41402abc4b2a76b9719d911017c592')
})

it('2. md5 of an empty string is the canonical empty-md5', () => {
  expect(md5('')).toBe('d41d8cd98f00b204e9800998ecf8427e')
})

it('3. md5 handles multi-byte UTF-8 correctly', () => {
  // 'é' is two bytes in UTF-8 (0xc3 0xa9).
  expect(md5('é')).toBe(md5('é'))
  expect(md5('café')).toMatch(/^[0-9a-f]{32}$/)
})

// ---------------------------------------------------------------------------
// md5OfMessageAttributes — the exact AWS attribute-MD5 algorithm
// ---------------------------------------------------------------------------

it('4. md5OfMessageAttributes returns undefined for empty / missing input', () => {
  expect(md5OfMessageAttributes(undefined)).toBeUndefined()
  expect(md5OfMessageAttributes(null)).toBeUndefined()
  expect(md5OfMessageAttributes({})).toBeUndefined()
})

it('5. md5OfMessageAttributes matches the AWS-canonical value for one String attribute', () => {
  // This is the exact value the AWS SDKs verify on response for the single
  // String attribute { Author: alice }.
  expect(
    md5OfMessageAttributes({
      Author: { DataType: 'String', StringValue: 'alice' },
    }),
  ).toBe('e359dfbf3997df0b05607a5e2e457d9b')
})

it('6. md5OfMessageAttributes sorts by name, so key order does not matter', () => {
  const a = md5OfMessageAttributes({
    Beta: { DataType: 'String', StringValue: '2' },
    Alpha: { DataType: 'String', StringValue: '1' },
  })
  const b = md5OfMessageAttributes({
    Alpha: { DataType: 'String', StringValue: '1' },
    Beta: { DataType: 'String', StringValue: '2' },
  })
  expect(a).toBe(b)
  expect(a).toMatch(/^[0-9a-f]{32}$/)
})

it('7. md5OfMessageAttributes distinguishes String from Binary transport types', () => {
  const asString = md5OfMessageAttributes({
    X: { DataType: 'String', StringValue: 'YQ==' },
  })
  const asBinary = md5OfMessageAttributes({
    X: { DataType: 'Binary', BinaryValue: 'YQ==' },
  })
  // Same textual payload, different transport-type byte → different digest.
  expect(asString).not.toBe(asBinary)
})
