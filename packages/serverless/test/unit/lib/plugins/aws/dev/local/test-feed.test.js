import { afterEach, describe, expect, jest, test } from '@jest/globals'
import fs from 'fs'
import path from 'path'
import { PassThrough } from 'stream'
import {
  TEST_FEED_FILE,
  startTestFeed,
  summarizeReply,
  testFeedEnabled,
} from '../../../../../../../lib/plugins/aws/dev/local/test-feed.js'
import { cleanTempDirs, tempDir } from './helpers.js'

const feeds = []
afterEach(async () => {
  for (const feed of feeds.splice(0)) await feed.stop()
  cleanTempDirs()
})

const start = async (invoke) => {
  const dir = path.join(tempDir(), '.serverless', 'dev')
  const runtime = { invoke: jest.fn(invoke) }
  const feed = await startTestFeed({ runtime, dir, pid: 4242 })
  feeds.push(feed)
  const { url, token, pid } = JSON.parse(
    fs.readFileSync(path.join(dir, TEST_FEED_FILE), 'utf8'),
  )
  const post = (body, auth = token) =>
    fetch(url, {
      method: 'POST',
      headers: { authorization: auth, 'content-type': 'application/json' },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    })
  return { dir, runtime, feed, url, token, pid, post }
}

describe('the test feed', () => {
  test('is enabled by SLS_DEV_TEST_FEED=1 only', () => {
    expect(testFeedEnabled({ SLS_DEV_TEST_FEED: '1' })).toBe(true)
    expect(testFeedEnabled({ SLS_DEV_TEST_FEED: 'true' })).toBe(false)
    expect(testFeedEnabled({})).toBe(false)
  })

  test('writes its loopback address and token for the owner only, and removes them on stop', async () => {
    const { dir, url, token, pid, feed } = await start(async () => ({
      kind: 'not_in_dev',
    }))
    expect(url).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/invoke$/)
    expect(token).toMatch(/^[0-9a-f]{64}$/)
    expect(pid).toBe(4242)
    if (process.platform !== 'win32') {
      expect(fs.statSync(path.join(dir, TEST_FEED_FILE)).mode & 0o777).toBe(
        0o600,
      )
    }
    await feed.stop()
    feeds.length = 0
    expect(fs.existsSync(path.join(dir, TEST_FEED_FILE))).toBe(false)
    await expect(fetch(url, { method: 'POST' })).rejects.toThrow()
  })

  test('replaces a file a killed session left behind', async () => {
    const dir = path.join(tempDir(), '.serverless', 'dev')
    fs.mkdirSync(dir, { recursive: true })
    const file = path.join(dir, TEST_FEED_FILE)
    fs.writeFileSync(file, '{"url":"http://127.0.0.1:1/invoke"}', {
      mode: 0o644,
    })
    const feed = await startTestFeed({ runtime: { invoke: jest.fn() }, dir })
    feeds.push(feed)
    expect(feed.file).toBe(file)
    expect(JSON.parse(fs.readFileSync(file, 'utf8')).pid).toBe(process.pid)
    if (process.platform !== 'win32') {
      expect(fs.statSync(file).mode & 0o777).toBe(0o600)
    }
  })

  test('refuses a .serverless/dev that is a link, writing nothing through it', async () => {
    const service = tempDir()
    const target = tempDir()
    const dir = path.join(service, '.serverless', 'dev')
    fs.mkdirSync(path.dirname(dir), { recursive: true })
    fs.symlinkSync(target, dir, 'junction')
    await expect(
      startTestFeed({ runtime: { invoke: jest.fn() }, dir }),
    ).rejects.toMatchObject({ code: 'EDEVLINK' })
    expect(fs.readdirSync(target)).toEqual([])
  })

  test('hands the invocation to the runtime as the relay would, and answers with the reply', async () => {
    const { post, runtime } = await start(async () => ({
      kind: 'response',
      contentType: 'application/json',
      body: Buffer.from('{"ok":true}'),
    }))
    const response = await post({
      function: 'api',
      environmentId: 'env-1',
      headers: { 'lambda-runtime-aws-request-id': 'req-1' },
      event: { a: 1 },
      environment: { AWS_REGION: 'us-east-1' },
    })
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      kind: 'response',
      errorType: null,
      contentType: 'application/json',
      bodyBase64: Buffer.from('{"ok":true}').toString('base64'),
    })
    const [request] = runtime.invoke.mock.calls[0]
    expect(request).toMatchObject({
      functionKey: 'api',
      environmentId: 'env-1',
      headers: { 'lambda-runtime-aws-request-id': 'req-1' },
      environment: { AWS_REGION: 'us-east-1' },
    })
    expect(request.event.toString()).toBe('{"a":1}')
  })

  test('takes a raw event as base64', async () => {
    const { post, runtime } = await start(async () => ({ kind: 'expired' }))
    const response = await post({
      function: 'api',
      environmentId: 'e',
      headers: {},
      eventBase64: Buffer.from('not json').toString('base64'),
    })
    expect(await response.json()).toEqual({
      kind: 'expired',
      errorType: null,
      contentType: null,
      bodyBase64: null,
    })
    expect(runtime.invoke.mock.calls[0][0].event.toString()).toBe('not json')
  })

  test('refuses a wrong token, a body that is not JSON, and other paths', async () => {
    const { post, url, token, runtime } = await start(async () => ({
      kind: 'expired',
    }))
    expect((await post({}, 'f'.repeat(64))).status).toBe(401)
    expect((await post({}, '')).status).toBe(401)
    expect((await post('{nope')).status).toBe(400)
    expect(
      (
        await fetch(url.replace('/invoke', '/other'), {
          method: 'POST',
          headers: { authorization: token },
        })
      ).status,
    ).toBe(404)
    expect(
      (await fetch(url, { method: 'GET', headers: { authorization: token } }))
        .status,
    ).toBe(404)
    expect(runtime.invoke).not.toHaveBeenCalled()
  })
})

describe('summarizeReply', () => {
  test('a stream records each chunk and its trailers', async () => {
    const body = new PassThrough()
    let clock = 100
    const summary = summarizeReply(
      {
        kind: 'stream',
        contentType: 'text/plain',
        body,
        ended: Promise.resolve({ errorType: 'Error', errorBody: 'eyJ9' }),
      },
      100,
      () => clock,
    )
    clock = 150
    body.write('one')
    await new Promise((resolve) => setImmediate(resolve))
    clock = 600
    body.end('two')
    expect(await summary).toEqual({
      kind: 'stream',
      errorType: 'Error',
      contentType: 'text/plain',
      bodyBase64: Buffer.from('onetwo').toString('base64'),
      chunks: [
        { atMs: 50, bytes: 3 },
        { atMs: 500, bytes: 3 },
      ],
      firstByteMs: 50,
      trailers: { errorType: 'Error', errorBody: 'eyJ9' },
    })
  })

  test('a function error keeps its type and body', async () => {
    expect(
      await summarizeReply(
        {
          kind: 'error',
          errorType: 'Error',
          body: Buffer.from('{"errorType":"Error"}'),
        },
        0,
      ),
    ).toEqual({
      kind: 'error',
      errorType: 'Error',
      contentType: null,
      bodyBase64: Buffer.from('{"errorType":"Error"}').toString('base64'),
    })
  })
})
