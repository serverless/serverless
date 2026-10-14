// addProxyToAwsClient chooses the proxy and the proxy CA for every AWS SDK client the CLI creates
// through @serverless/util. These tests pin the options it hands to aws-sdk-v3-proxy, so a change
// that shares its rules with other code keeps what every command does today.
import fs from 'fs'
import os from 'os'
import path from 'path'
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  jest,
  test,
} from '@jest/globals'

const addProxyToClient = jest.fn((client) => client)
jest.unstable_mockModule('aws-sdk-v3-proxy', () => ({ addProxyToClient }))

const { addProxyToAwsClient } =
  await import('@serverless/util/src/proxy/aws.js')

const VARIABLES = [
  'proxy',
  'HTTP_PROXY',
  'http_proxy',
  'HTTPS_PROXY',
  'https_proxy',
  'NO_PROXY',
  'no_proxy',
  'ca',
  'HTTPS_CA',
  'https_ca',
  'cafile',
  'HTTPS_CAFILE',
  'https_cafile',
  'AWS_CLIENT_TIMEOUT',
  'aws_client_timeout',
]

describe('addProxyToAwsClient', () => {
  let saved
  beforeEach(() => {
    saved = Object.fromEntries(
      VARIABLES.map((name) => [name, process.env[name]]),
    )
    for (const name of VARIABLES) delete process.env[name]
    addProxyToClient.mockClear()
  })
  afterEach(() => {
    for (const [name, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[name]
      else process.env[name] = value
    }
  })

  const optionsWith = (env, overrides) => {
    addProxyToClient.mockClear()
    Object.assign(process.env, env)
    const client = { config: {} }
    expect(addProxyToAwsClient(client, overrides)).toBe(client)
    if (addProxyToClient.mock.calls.length === 0) return undefined
    const [passed, options] = addProxyToClient.mock.calls[0]
    expect(passed).toBe(client)
    return options
  }
  const proxiesWith = (env) => {
    const { httpProxy, httpsProxy } = optionsWith(env)
    return { httpProxy, httpsProxy }
  }

  test('without proxy variables it passes no proxy and never throws', () => {
    expect(optionsWith({})).toEqual({
      agentOptions: { proxyRequestOptions: { rejectUnauthorized: true } },
      throwOnNoProxy: false,
    })
  })

  test('HTTP_PROXY and HTTPS_PROXY each go to their own scheme, in either case', () => {
    expect(proxiesWith({ HTTP_PROXY: 'http://h:1' })).toEqual({
      httpProxy: 'http://h:1',
      httpsProxy: undefined,
    })
    delete process.env.HTTP_PROXY
    expect(proxiesWith({ https_proxy: 'http://s:2' })).toEqual({
      httpProxy: undefined,
      httpsProxy: 'http://s:2',
    })
  })

  test('both set: both are passed, so HTTPS requests take HTTPS_PROXY', () => {
    expect(
      proxiesWith({ HTTP_PROXY: 'http://h:1', HTTPS_PROXY: 'http://s:2' }),
    ).toEqual({ httpProxy: 'http://h:1', httpsProxy: 'http://s:2' })
  })

  // Windows has one variable per name whatever its case, so both spellings cannot be set there.
  const caseSensitiveEnv = process.platform === 'win32' ? test.skip : test
  caseSensitiveEnv('the upper-case name wins over the lower-case one', () => {
    expect(
      proxiesWith({
        HTTP_PROXY: 'http://upper:1',
        http_proxy: 'http://lower:1',
        HTTPS_PROXY: '  ',
        https_proxy: ' http://lower:2 ',
      }),
    ).toEqual({ httpProxy: 'http://upper:1', httpsProxy: 'http://lower:2' })
  })

  test('blank values do not count, and values are trimmed', () => {
    expect(
      proxiesWith({ HTTP_PROXY: '  ', HTTPS_PROXY: ' http://s:2 ' }),
    ).toEqual({ httpProxy: undefined, httpsProxy: 'http://s:2' })
  })

  test('a generic `proxy` applies only when neither is set, by its own scheme', () => {
    expect(proxiesWith({ proxy: 'http://g:1' })).toEqual({
      httpProxy: 'http://g:1',
      httpsProxy: undefined,
    })
    delete process.env.proxy
    expect(proxiesWith({ proxy: 'https://g:1' })).toEqual({
      httpProxy: undefined,
      httpsProxy: 'https://g:1',
    })
    delete process.env.proxy
    expect(
      proxiesWith({ proxy: 'http://g:1', HTTPS_PROXY: 'http://s:2' }),
    ).toEqual({
      httpProxy: undefined,
      httpsProxy: 'http://s:2',
    })
  })

  test('explicit proxies replace the environment', () => {
    const options = optionsWith(
      { HTTP_PROXY: 'http://h:1', HTTPS_PROXY: 'http://s:2' },
      { httpsProxy: 'http://given:3' },
    )
    expect(options.httpProxy).toBeUndefined()
    expect(options.httpsProxy).toBe('http://given:3')
  })

  test('the proxy CA comes from `ca`/HTTPS_CA and `cafile`/HTTPS_CAFILE, for the proxy handshake only', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'proxy-ca-'))
    const file = path.join(dir, 'ca.pem')
    fs.writeFileSync(file, 'FILE-CA')
    try {
      const { agentOptions } = optionsWith({
        HTTPS_PROXY: 'http://s:2',
        HTTPS_CA: 'INLINE-CA',
        HTTPS_CAFILE: file,
      })
      expect(agentOptions).toEqual({
        proxyRequestOptions: {
          ca: ['INLINE-CA', 'FILE-CA'],
          rejectUnauthorized: true,
        },
      })
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })

  test('an unreadable CA file is skipped', () => {
    const { agentOptions } = optionsWith({
      HTTPS_PROXY: 'http://s:2',
      cafile: path.join(os.tmpdir(), 'no-such-dir-proxy-ca', 'ca.pem'),
    })
    expect(agentOptions).toEqual({
      proxyRequestOptions: { rejectUnauthorized: true },
    })
  })

  test('NO_PROXY covering the AWS endpoints leaves the client as it is', () => {
    expect(
      optionsWith({ HTTPS_PROXY: 'http://s:2', NO_PROXY: '.amazonaws.com' }),
    ).toBeUndefined()
  })

  test('AWS_CLIENT_TIMEOUT sets both timeouts', () => {
    const options = optionsWith({ AWS_CLIENT_TIMEOUT: '5000' })
    expect(options.connectionTimeout).toBe(5000)
    expect(options.socketTimeout).toBe(5000)
  })
})
