import { createHash, createHmac } from 'node:crypto'

/**
 * SHA-256 (and HMAC-SHA-256 when given a secret) in the shape the
 * `@smithy/signature-v4` signer expects for its `sha256` option.
 */
export class Sha256 {
  constructor(secret) {
    this.secret = secret
    this.reset()
  }

  update(data) {
    this.hash.update(data)
  }

  async digest() {
    return new Uint8Array(this.hash.digest())
  }

  reset() {
    this.hash = this.secret
      ? createHmac('sha256', this.secret)
      : createHash('sha256')
  }
}
