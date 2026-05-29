import { StringDecoder } from 'node:string_decoder'

/**
 * Create a stateful UTF-8 decoder for a child-process output stream.
 *
 * Decoding every `data` Buffer through the SAME decoder reassembles a
 * multi-byte character that lands split across two `data` events, instead of
 * each `Buffer.toString()` corrupting the boundary byte to U+FFFD. Callers
 * keep their own line-splitting / trimming; this only fixes the decode.
 *
 * @returns {(buffer: Buffer) => string}
 */
export function createUtf8Decoder() {
  const decoder = new StringDecoder('utf8')
  return (buffer) => decoder.write(buffer)
}
