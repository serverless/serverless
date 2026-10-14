// getProxyAgent gives Dev Mode's WebSocket to AWS IoT Core, and its dry-run connection check, the
// proxy and proxy CA that addProxyToAwsClient gives an AWS SDK client for an HTTPS endpoint.
import fs from 'fs'
import os from 'os'
import path from 'path'
import { describe, expect, test } from '@jest/globals'
import { HttpsProxyAgent } from 'https-proxy-agent'
import { getProxyAgent } from '@serverless/util/src/proxy/index.js'

const URL = 'wss://example-ats.iot.us-east-1.amazonaws.com/mqtt'

describe('getProxyAgent', () => {
  test('no proxy variable: no agent', () => {
    expect(getProxyAgent(URL, { env: {} })).toBeUndefined()
  })

  test('HTTPS_PROXY wins over HTTP_PROXY and a generic proxy, either case', () => {
    const host = (env) => getProxyAgent(URL, { env }).proxy.host
    expect(
      host({
        HTTP_PROXY: 'http://h:1',
        https_proxy: 'http://s:2',
        proxy: 'http://g:3',
      }),
    ).toBe('s:2')
    expect(host({ http_proxy: 'http://h:1', proxy: 'http://g:3' })).toBe('h:1')
    expect(host({ proxy: 'https://g:3' })).toBe('g:3')
    expect(host({ HTTPS_PROXY: ' ', HTTP_PROXY: 'http://h:1' })).toBe('h:1')
  })

  test('the proxy CA goes to the connection to the proxy, which is verified', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'proxy-agent-ca-'))
    const file = path.join(dir, 'ca.pem')
    fs.writeFileSync(file, 'FILE-CA')
    try {
      const agent = getProxyAgent(URL, {
        env: {
          HTTPS_PROXY: 'https://s:2',
          HTTPS_CA: 'INLINE-CA',
          cafile: file,
        },
      })
      expect(agent).toBeInstanceOf(HttpsProxyAgent)
      expect(agent.connectOpts.ca).toEqual(['INLINE-CA', 'FILE-CA'])
      expect(agent.connectOpts.rejectUnauthorized).toBe(true)
      const plain = getProxyAgent(URL, { env: { HTTPS_PROXY: 'https://s:2' } })
      expect(plain.connectOpts.ca).toBeUndefined()
      expect(plain.connectOpts.rejectUnauthorized).toBe(true)
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })

  test('the given agent options reach the agent', () => {
    const { signal } = new AbortController()
    const agent = getProxyAgent(URL, {
      env: { HTTPS_PROXY: 'http://s:2' },
      agentOptions: { signal },
    })
    expect(agent.connectOpts.signal).toBe(signal)
  })

  test('NO_PROXY in the given environment covers the host', () => {
    expect(
      getProxyAgent(URL, {
        env: { HTTPS_PROXY: 'http://s:2', NO_PROXY: '.amazonaws.com' },
      }),
    ).toBeUndefined()
  })
})
