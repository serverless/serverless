import { presignIotWebSocket } from '../../../../../../../lib/plugins/aws/dev/relay/sigv4.js'

// AWS's documented example key pair, a fixed date and a token with characters that need escaping.
const exampleCredentials = {
  accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
  secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
}
const exampleDate = new Date('2013-05-24T00:00:00Z')
const endpoint = 'abc-ats.iot.us-east-1.amazonaws.com'

// The same inputs signed by aws-sdk-go-v2's v4 signer (PresignHTTP, service iotdevicegateway,
// without the token, which is then appended): the bridge signs its own connection that way.
const GOLDEN_URL =
  'wss://abc-ats.iot.us-east-1.amazonaws.com/mqtt?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Credential=AKIAIOSFODNN7EXAMPLE%2F20130524%2Fus-east-1%2Fiotdevicegateway%2Faws4_request&X-Amz-Date=20130524T000000Z&X-Amz-Expires=300&X-Amz-SignedHeaders=host&X-Amz-Signature=e8df4926f8cbb2d1b2a1d83d2d811455ac8bce957bccea59b55bff870389d73c&X-Amz-Security-Token=tok%2Fen%2B%3D'

describe('the AWS IoT Core WebSocket URL', () => {
  test('matches the URL the bridge signer produces for the same inputs', async () => {
    const url = await presignIotWebSocket({
      endpoint,
      region: 'us-east-1',
      credentials: { ...exampleCredentials, sessionToken: 'tok/en+=' },
      date: exampleDate,
    })
    expect(url).toBe(GOLDEN_URL)
  })

  test('is a SigV4 presigned GET of /mqtt for iotdevicegateway, signing only the host', async () => {
    const url = new URL(
      await presignIotWebSocket({
        endpoint,
        region: 'eu-west-1',
        credentials: exampleCredentials,
        date: exampleDate,
        expiresSeconds: 120,
      }),
    )
    expect(url.protocol).toBe('wss:')
    expect(url.host).toBe(endpoint)
    expect(url.pathname).toBe('/mqtt')
    expect(Object.fromEntries(url.searchParams)).toEqual({
      'X-Amz-Algorithm': 'AWS4-HMAC-SHA256',
      'X-Amz-Credential':
        'AKIAIOSFODNN7EXAMPLE/20130524/eu-west-1/iotdevicegateway/aws4_request',
      'X-Amz-Date': '20130524T000000Z',
      'X-Amz-Expires': '120',
      'X-Amz-SignedHeaders': 'host',
      'X-Amz-Signature': expect.stringMatching(/^[0-9a-f]{64}$/),
    })
  })

  test('without a session token there is no token parameter', async () => {
    const url = await presignIotWebSocket({
      endpoint,
      region: 'us-east-1',
      credentials: exampleCredentials,
      date: exampleDate,
    })
    expect(url).not.toMatch(/X-Amz-Security-Token/)
    expect(url).toBe(GOLDEN_URL.replace(/&X-Amz-Security-Token=.*$/, ''))
  })

  test('the session token is appended last and is not part of the signature', async () => {
    const sign = (sessionToken) =>
      presignIotWebSocket({
        endpoint,
        region: 'us-east-1',
        credentials: { ...exampleCredentials, sessionToken },
        date: exampleDate,
      })
    const one = new URL(await sign('first'))
    const other = new URL(await sign('second'))
    expect([...one.searchParams.keys()].at(-1)).toBe('X-Amz-Security-Token')
    expect(one.searchParams.get('X-Amz-Security-Token')).toBe('first')
    expect(one.searchParams.get('X-Amz-Signature')).toBe(
      other.searchParams.get('X-Amz-Signature'),
    )
  })

  test('another date or secret signs differently, and the URL never carries the secret', async () => {
    const base = { endpoint, region: 'us-east-1', date: exampleDate }
    const signature = async (options) =>
      new URL(
        await presignIotWebSocket({ ...base, ...options }),
      ).searchParams.get('X-Amz-Signature')
    const reference = await signature({ credentials: exampleCredentials })
    expect(
      await signature({
        credentials: exampleCredentials,
        date: new Date('2013-05-24T00:00:01Z'),
      }),
    ).not.toBe(reference)
    expect(
      await signature({
        credentials: { ...exampleCredentials, secretAccessKey: 'other' },
      }),
    ).not.toBe(reference)
    const url = await presignIotWebSocket({
      ...base,
      credentials: exampleCredentials,
    })
    expect(
      url.includes(encodeURIComponent(exampleCredentials.secretAccessKey)),
    ).toBe(false)
    expect(url.includes(exampleCredentials.secretAccessKey)).toBe(false)
  })
})
