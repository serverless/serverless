/**
 * The presigned URL of this machine's MQTT-over-WebSocket connection to AWS IoT Core, signed with
 * AWS's own SigV4 signer. AWS IoT Core refuses a WebSocket URL whose session token is part of the
 * signature, so the signer gets only the access key id and secret, and the token is appended after
 * signing. The parameters are written in the order AWS's SDK for Go writes them (the signed ones
 * sorted, then the signature, then the token), so the CLI and the bridge produce the same URL for
 * the same inputs.
 */
import { createHash, createHmac } from 'node:crypto'
import { SignatureV4 } from '@smithy/signature-v4'

const SERVICE = 'iotdevicegateway'
const SIGNATURE = 'X-Amz-Signature'
const SECURITY_TOKEN = 'X-Amz-Security-Token'
/** AWS IoT Core accepts the URL for this long after it was signed. */
const DEFAULT_EXPIRES_SECONDS = 300

/** SHA-256 (and HMAC-SHA-256 when given a secret) in the shape the signer expects. */
class Sha256 {
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

const byName = ([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)

/** `wss://<endpoint>/mqtt?…`, signed now (or at `date`) with `credentials`, the token appended. */
export const presignIotWebSocket = async ({
  endpoint,
  region,
  credentials,
  date = new Date(),
  expiresSeconds = DEFAULT_EXPIRES_SECONDS,
}) => {
  const signer = new SignatureV4({
    service: SERVICE,
    region,
    sha256: Sha256,
    credentials: {
      accessKeyId: credentials.accessKeyId,
      secretAccessKey: credentials.secretAccessKey,
    },
  })
  const signed = await signer.presign(
    {
      method: 'GET',
      protocol: 'wss:',
      hostname: endpoint,
      path: '/mqtt',
      headers: { host: endpoint },
      query: {},
    },
    { signingDate: date, expiresIn: expiresSeconds },
  )
  const { [SIGNATURE]: signature, ...query } = signed.query
  const params = [...Object.entries(query).sort(byName), [SIGNATURE, signature]]
  if (credentials.sessionToken) {
    params.push([SECURITY_TOKEN, credentials.sessionToken])
  }
  return `wss://${endpoint}/mqtt?${new URLSearchParams(params)}`
}
