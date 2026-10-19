import { createHash, createHmac } from 'node:crypto'
import { SignatureV4 } from '@smithy/signature-v4'
import { Sha256 } from '../../../../../../lib/plugins/aws/lib/sigv4.js'

const hex = (bytes) => Buffer.from(bytes).toString('hex')

describe('Sha256', () => {
  test('digests SHA-256 to a Uint8Array', async () => {
    const hash = new Sha256()
    hash.update('abc')
    const digest = await hash.digest()
    expect(digest).toBeInstanceOf(Uint8Array)
    expect(hex(digest)).toBe(createHash('sha256').update('abc').digest('hex'))
  })

  test('digests HMAC-SHA-256 when given a secret', async () => {
    const hash = new Sha256('key')
    hash.update('abc')
    expect(hex(await hash.digest())).toBe(
      createHmac('sha256', 'key').update('abc').digest('hex'),
    )
  })

  test('starts over after reset', async () => {
    const hash = new Sha256('key')
    hash.update('discarded')
    hash.reset()
    hash.update('abc')
    expect(hex(await hash.digest())).toBe(
      createHmac('sha256', 'key').update('abc').digest('hex'),
    )
  })

  test('signs a request with SignatureV4', async () => {
    const signer = new SignatureV4({
      service: 'lambda',
      region: 'us-east-1',
      sha256: Sha256,
      credentials: {
        accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
        secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
      },
    })
    const signed = await signer.sign(
      {
        method: 'GET',
        protocol: 'https:',
        hostname: 'example.on.aws',
        path: '/',
        headers: { host: 'example.on.aws' },
      },
      { signingDate: new Date('2013-05-24T00:00:00Z') },
    )
    expect(signed.headers.authorization).toMatch(
      /^AWS4-HMAC-SHA256 Credential=AKIAIOSFODNN7EXAMPLE\/20130524\/us-east-1\/lambda\/aws4_request, SignedHeaders=host;x-amz-content-sha256;x-amz-date, Signature=[0-9a-f]{64}$/,
    )
  })
})
