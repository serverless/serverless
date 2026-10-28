import { createHash } from 'node:crypto'

/**
 * `size` bytes that never repeat a block: SHA-256 of `<seed>:<n>` for n = 0, 1, … The suite builds
 * the same bytes to compare a response with, byte for byte.
 */
export const patternBytes = (size, seed = 'devmode-web') => {
  const blocks = []
  for (let n = 0, total = 0; total < size; n += 1, total += 32) {
    blocks.push(createHash('sha256').update(`${seed}:${n}`).digest())
  }
  return Buffer.concat(blocks).subarray(0, size)
}
