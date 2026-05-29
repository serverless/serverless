import { Buffer } from 'node:buffer'
import { createUtf8Decoder } from '../../../../../../../../lib/plugins/aws/offline/lib/runners/utf8-decoder.js'

describe('createUtf8Decoder', () => {
  it('reassembles a multi-byte character split across buffers', () => {
    const decode = createUtf8Decoder()
    const buf = Buffer.from('café', 'utf8') // é = 0xc3 0xa9
    const splitAt = buf.length - 1 // split mid-é (trailing byte alone)
    const a = decode(buf.subarray(0, splitAt))
    const b = decode(buf.subarray(splitAt))
    expect(a + b).toBe('café')
    expect(a + b).not.toContain('�')
  })

  it('returns the full string when no split occurs', () => {
    const decode = createUtf8Decoder()
    expect(decode(Buffer.from('hello', 'utf8'))).toBe('hello')
  })

  it('keeps independent state per instance', () => {
    const d1 = createUtf8Decoder()
    const d2 = createUtf8Decoder()
    const buf = Buffer.from('é', 'utf8')
    d1(buf.subarray(0, 1)) // d1 buffers an incomplete byte
    expect(d2(buf)).toBe('é') // d2 is unaffected
  })
})
