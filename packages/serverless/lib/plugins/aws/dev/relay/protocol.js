/**
 * The Dev Mode relay's wire format, shared with the bridge (dev-mode-bridge/internal/protocol).
 * Every MQTT message and every S3 payload object is one sealed frame:
 *
 *   byte 0      protocol version (1)
 *   bytes 1-4   sequence number of the sender on this topic (uint32, big-endian)
 *   bytes 5-16  nonce (12 random bytes)
 *   bytes 17-   AES-256-GCM ciphertext of the frame, then the 16-byte tag
 *
 * The additional authenticated data is bytes 0-4 followed by the topic (UTF-8), so a frame cannot
 * be moved to another topic or have its sequence number changed. A frame's plaintext is a JSON
 * header, a newline (0x0A) and the body bytes. The key is the session key: 32 random bytes the
 * CLI generates per session and writes only to attached functions (SLS_DEV_SESSION_KEY, base64).
 * Changing any of this is a new protocol version: old layers and new CLIs meet after a take-over.
 */
import {
  createCipheriv,
  createDecipheriv,
  randomBytes as nodeRandomBytes,
} from 'crypto'

export const PROTOCOL_VERSION = 1
/** The largest MQTT message Dev Mode publishes (AWS IoT Core accepts 128 KB payloads). */
export const MAX_MESSAGE_BYTES = 129_024
/** Stream data frames carry at most this much of the body each. */
export const STREAM_CHUNK_BYTES = 100 * 1024
const PREFIX_BYTES = 17
const NONCE_BYTES = 12
const TAG_BYTES = 16
const KEY_BYTES = 32
export const FRAME_OVERHEAD_BYTES = PREFIX_BYTES + TAG_BYTES
const CIPHER = 'aes-256-gcm'
const NEWLINE = Buffer.from('\n')
const EMPTY = Buffer.alloc(0)

export const KIND = Object.freeze({
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
  /** The header of an S3 payload object (its topic is s3/<key>). */
  PAYLOAD: 'payload',
  /**
   * A bridge's count of the invocations it handed to the deployed code because this session could
   * not be reached; its body is JSON: { since, counts: [{ fn, reason, n }] }.
   */
  PASSED: 'passed',
})

/**
 * The execution environment id of `serverless dev replay`'s own handler process: no bridge's, so a
 * message naming it is never taken.
 */
export const REPLAY_ENVIRONMENT_ID = 'dev-replay'

export const topicsOf = (session) => ({
  up: `sls-dev/${session}/up`,
  down: (environmentId) => `sls-dev/${session}/down/${environmentId}`,
  gone: `sls-dev/${session}/gone`,
  ping: `sls-dev/${session}/ping`,
})
/**
 * S3 payload objects are under `<root>/<service>/<stage>/<session>/` in the deployment bucket
 * (`serverless remove` deletes the stage's prefix).
 */
export const SIDE_CHANNEL_ROOT = 'serverless-dev-mode'
export const laptopClientId = (session) => `sls-dev-${session}-cli`
export const bridgeClientId = (session, environmentId) =>
  `sls-dev-${session}-${environmentId}`

/**
 * The session key from its base64 form. Anything but the standard base64 of exactly 32 bytes is
 * refused, including characters Node's decoder would otherwise skip, as the bridge refuses them.
 */
export const decodeSessionKey = (base64) => {
  const text = typeof base64 === 'string' ? base64 : ''
  const key = Buffer.from(text, 'base64')
  if (key.length !== KEY_BYTES || key.toString('base64') !== text) {
    throw new TypeError('A Dev Mode session key is 32 bytes in base64')
  }
  return key
}

const additionalData = (prefix, topic) =>
  Buffer.concat([prefix.subarray(0, 5), Buffer.from(topic, 'utf8')])

/** One sealed frame from its parts; `nonce` is 12 bytes, `seq` a uint32. */
export const sealRaw = ({ key, nonce, seq, topic, plaintext }) => {
  if (nonce?.length !== NONCE_BYTES) {
    throw new TypeError('A Dev Mode frame nonce is 12 bytes')
  }
  const prefix = Buffer.alloc(PREFIX_BYTES)
  prefix.writeUInt8(PROTOCOL_VERSION, 0)
  prefix.writeUInt32BE(seq >>> 0, 1)
  Buffer.from(nonce).copy(prefix, 5)
  const cipher = createCipheriv(CIPHER, key, prefix.subarray(5), {
    authTagLength: TAG_BYTES,
  })
  cipher.setAAD(additionalData(prefix, topic))
  const sealed = Buffer.concat([cipher.update(plaintext), cipher.final()])
  return Buffer.concat([prefix, sealed, cipher.getAuthTag()])
}

/**
 * `{ seq, nonce, plaintext }`, or null for anything that is not a frame of this protocol version
 * sealed with this key for this topic. Never throws.
 */
export const openRaw = ({ key, topic, message }) => {
  try {
    const data = Buffer.from(message)
    if (data.length < FRAME_OVERHEAD_BYTES) return null
    if (data.readUInt8(0) !== PROTOCOL_VERSION) return null
    const prefix = data.subarray(0, PREFIX_BYTES)
    const decipher = createDecipheriv(CIPHER, key, prefix.subarray(5), {
      authTagLength: TAG_BYTES,
    })
    decipher.setAAD(additionalData(prefix, topic))
    decipher.setAuthTag(data.subarray(data.length - TAG_BYTES))
    const plaintext = Buffer.concat([
      decipher.update(data.subarray(PREFIX_BYTES, data.length - TAG_BYTES)),
      decipher.final(),
    ])
    return {
      seq: data.readUInt32BE(1),
      nonce: Buffer.from(prefix.subarray(5)),
      plaintext,
    }
  } catch {
    return null
  }
}

/**
 * Types on the wire: the bridge drops a whole frame when any header field has another type than
 * it expects, so every number in a header this machine sends is an integer (`sentAt`,
 * `remainingMs`, `n`, `count`, `ttlMs`, never a fraction) and every other value is a string,
 * including each value of a map (`headers` of an upload, `environment`).
 */
export const encodeFrame = (header, body = EMPTY) =>
  Buffer.concat([Buffer.from(JSON.stringify(header)), NEWLINE, body])

/** `{ header, body }`, or null when the plaintext is not a header line and a body. */
export const decodeFrame = (plaintext) => {
  const end = plaintext.indexOf(0x0a)
  if (end < 0) return null
  try {
    const header = JSON.parse(plaintext.subarray(0, end).toString('utf8'))
    if (
      !header ||
      typeof header !== 'object' ||
      typeof header.kind !== 'string'
    ) {
      return null
    }
    return { header, body: plaintext.subarray(end + 1) }
  } catch {
    return null
  }
}

/** Whether a frame with this header and body fits one MQTT message. */
export const fitsOneMessage = (header, body = EMPTY) =>
  Buffer.byteLength(JSON.stringify(header)) +
    1 +
    body.length +
    FRAME_OVERHEAD_BYTES <=
  MAX_MESSAGE_BYTES

/** Seals frames for one sender: a fresh nonce each, sequence numbers counting up per topic. */
export const createSealer = ({ key, randomBytes = nodeRandomBytes }) => {
  const sequences = new Map()
  return (topic, header, body = EMPTY) => {
    const seq = ((sequences.get(topic) ?? 0) + 1) >>> 0
    sequences.set(topic, seq)
    return sealRaw({
      key,
      nonce: randomBytes(NONCE_BYTES),
      seq,
      topic,
      plaintext: encodeFrame(header, body),
    })
  }
}

/**
 * Opens frames for one receiver. AWS IoT Core delivers a QoS 1 message more than once now and
 * then; a frame whose nonce was among the last `remember` ones is a copy and returns null, as does
 * every frame that does not open or decode.
 */
export const createOpener = ({ key, remember = 4096 }) => {
  const seen = new Set()
  return (topic, message) => {
    const opened = openRaw({ key, topic, message })
    if (!opened) return null
    const id = opened.nonce.toString('hex')
    if (seen.has(id)) return null
    seen.add(id)
    if (seen.size > remember) seen.delete(seen.values().next().value)
    const frame = decodeFrame(opened.plaintext)
    return frame && { ...frame, seq: opened.seq }
  }
}
