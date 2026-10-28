import { afterEach, describe, expect, test } from '@jest/globals'
import fs from 'node:fs'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { PassThrough, Readable } from 'node:stream'
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
} from '@aws-sdk/client-s3'
import {
  CREDENTIALS_PATH,
  RESPONSE_OBJECT_BYTES,
  createUpRouter,
  createWebPublish,
  createWebRelay,
} from '../../../../../../../lib/plugins/aws/dev/web/relay.js'
import { createBridge } from '../../../../../../../lib/plugins/aws/dev/web/bridge/server.mjs'
import { createSideChannel } from '../../../../../../../lib/plugins/aws/dev/relay/side-channel.js'
import { WEB_PACING } from '../../../../../../../lib/plugins/aws/dev/relay/pacer.js'
import { createRequestRecorder } from '../../../../../../../lib/plugins/aws/dev/state/requests.js'
import {
  KIND,
  WEB_BODY_BYTES,
  createOpener,
  createSealer,
  topicsOf,
} from '../../../../../../../lib/plugins/aws/dev/relay/protocol.js'

const KEY = Buffer.alloc(32, 9)
const SESSION = 's_0123456789ab'
const topics = topicsOf(SESSION)
const ENV_ID = 'e0123456789ab'
const ROLE = {
  AWS_ACCESS_KEY_ID: 'ASIAWEBROLENEVERLOGGED',
  AWS_SECRET_ACCESS_KEY: 'web-role-secret-never-logged',
  AWS_SESSION_TOKEN: 'web-role-token-never-logged',
}
const settle = (ms = 10) => new Promise((resolve) => setTimeout(resolve, ms))
const waitFor = async (check, ms = 5_000) => {
  const until = Date.now() + ms
  while (!check()) {
    if (Date.now() > until) throw new Error('timed out waiting')
    await settle(5)
  }
}
/** A body of `size` bytes no two of whose 251-byte runs line up with a frame boundary. */
const patterned = (size, seed = 1) => {
  const data = Buffer.alloc(size)
  for (let i = 0; i < size; i++) data[i] = (i * 31 + seed) % 251
  return data
}

/** A recorder stand-in that keeps what it was told. */
const fakeRecorder = () => {
  const calls = []
  return {
    calls,
    start: (details) => calls.push(['start', details]),
    end: (details) => calls.push(['end', details]),
  }
}

/** An in-memory side channel shaped like relay/side-channel.js. */
const fakeSideChannel = () => {
  const objects = new Map()
  let next = 0
  return {
    enabled: true,
    objects,
    uploads: [],
    discarded: [],
    async upload(body) {
      next += 1
      const key = `prefix/${next}`
      objects.set(key, Buffer.from(body))
      this.uploads.push(key)
      return { key, get: `https://get/${key}`, delete: `https://delete/${key}` }
    },
    async uploadUrl() {
      next += 1
      return {
        url: `https://put/prefix/${next}`,
        headers: {},
        key: `prefix/${next}`,
        ttlMs: 900_000,
      }
    },
    async download({ key }) {
      const body = objects.get(key)
      objects.delete(key)
      if (!body) throw new Error('NoSuchKey')
      return body
    },
    async discard({ key }) {
      this.discarded.push(key)
      objects.delete(key)
    },
  }
}

const relays = []
afterEach(async () => {
  for (const relay of relays.splice(0)) {
    relay.stopAccepting()
    await relay.drain(1_000)
  }
})

/** A web relay whose publishes are opened and kept, with a dispatch the test sets. */
const setup = ({
  dispatch = async () => ({
    status: 200,
    headers: { 'content-type': 'text/plain' },
    body: Readable.from([Buffer.from('hello')]),
  }),
  sideChannel = fakeSideChannel(),
  isServing,
  publish,
  localOnly,
  recorder = fakeRecorder(),
} = {}) => {
  const seal = createSealer({ key: KEY })
  const open = createOpener({ key: KEY })
  const frames = []
  const published = []
  const dispatched = []
  const updates = []
  const debug = []
  const relay = createWebRelay({
    sessionId: SESSION,
    key: KEY,
    functions: new Map([['svc-dev-web', 'web']]),
    dispatch: async (request) => {
      dispatched.push(request)
      return dispatch(request)
    },
    credentials: { update: (key, values) => updates.push([key, values]) },
    isServing,
    ...(localOnly && { localOnly }),
    sideChannel,
    recorder,
    publish:
      publish ??
      (async (message) => {
        published.push(message)
        const frame = open(message.topic, message.payload)
        frames.push({ topic: message.topic, ...frame })
        return true
      }),
    timers: { setTimeout, clearTimeout },
    logger: { debug: (line) => debug.push(line) },
  })
  relays.push(relay)
  const send = (header, body = Buffer.alloc(0)) =>
    relay.receive(topics.up, seal(topics.up, header, body))
  const request = (fields = {}, body) =>
    send(
      {
        kind: KIND.REQUEST,
        env: ENV_ID,
        fn: 'svc-dev-web',
        id: 'r1',
        sentAt: Date.now(),
        method: 'POST',
        path: '/hello?x=1',
        headers: { 'content-type': 'text/plain', host: 'example.com' },
        environment: ROLE,
        ...fields,
      },
      body,
    )
  const kinds = (id = 'r1') =>
    frames.filter((f) => f.header.id === id).map((f) => f.header.kind)
  const bodyOf = (id = 'r1') =>
    Buffer.concat(
      frames
        .filter((f) => f.header.id === id && f.header.kind === KIND.STREAM_DATA)
        .sort((a, b) => a.header.n - b.header.n)
        .map((f) => f.body),
    )
  return {
    relay,
    send,
    request,
    frames,
    published,
    dispatched,
    updates,
    debug,
    recorder,
    sideChannel,
    kinds,
    bodyOf,
  }
}

describe('the web relay on the developer machine', () => {
  test('accepts and dispatches a request', async () => {
    const t = setup()
    t.request({}, Buffer.from('hi'))
    await waitFor(() => t.kinds().includes(KIND.STREAM_END))
    expect(t.kinds()).toEqual([
      KIND.ACCEPTED,
      KIND.RESPONSE_START,
      KIND.STREAM_DATA,
      KIND.STREAM_END,
    ])
    expect(new Set(t.frames.map((f) => f.topic))).toEqual(
      new Set([topics.down(ENV_ID)]),
    )
    expect(t.dispatched).toEqual([
      {
        key: 'web',
        id: 'r1',
        method: 'POST',
        path: '/hello?x=1',
        headers: { 'content-type': 'text/plain', host: 'example.com' },
        body: Buffer.from('hi'),
        source: 'relay',
        signal: expect.any(AbortSignal),
      },
    ])
    const [, start, data, end] = t.frames
    expect(start.header).toEqual({
      kind: KIND.RESPONSE_START,
      id: 'r1',
      status: 200,
      headers: { 'content-type': 'text/plain' },
    })
    expect(data.header).toEqual({ kind: KIND.STREAM_DATA, id: 'r1', n: 0 })
    expect(data.body.toString()).toBe('hello')
    expect(end.header).toEqual({ kind: KIND.STREAM_END, id: 'r1', count: 1 })
    // The acceptance goes ahead of everything; the body is data.
    expect(t.published.map((m) => m.priority)).toEqual([
      'acceptance',
      'control',
      'data',
      'control',
    ])
    // The role credentials go to the web app's credentials, never to a log line.
    expect(t.updates).toEqual([['web', ROLE]])
    for (const secret of Object.values(ROLE)) {
      expect(t.debug.join('\n')).not.toContain(secret)
    }
    expect(t.recorder.calls).toEqual([
      [
        'start',
        expect.objectContaining({
          id: 'r1',
          key: 'web',
          method: 'POST',
          path: '/hello?x=1',
          environmentId: ENV_ID,
        }),
      ],
      [
        'end',
        expect.objectContaining({
          id: 'r1',
          key: 'web',
          outcome: 'answered',
          status: 200,
          bytes: 5,
        }),
      ],
    ])
  })

  test('a response of at most 64 KiB goes inline; a larger one goes through the deployment bucket', async () => {
    const small = patterned(30 * 1024)
    const large = patterned(2 * 1024 * 1024, 7)
    const t = setup({
      dispatch: async ({ path }) => ({
        status: 200,
        headers: { 'content-type': 'application/octet-stream' },
        body: Readable.from(
          path === '/large'
            ? Array.from({ length: 32 }, (_, i) =>
                large.subarray(i * 65_536, (i + 1) * 65_536),
              )
            : [small.subarray(0, 10_000), small.subarray(10_000)],
        ),
      }),
    })
    t.request({ id: 'r-small', path: '/small' })
    t.request({ id: 'r-large', path: '/large' })
    await waitFor(
      () =>
        t.kinds('r-small').includes(KIND.STREAM_END) &&
        t.kinds('r-large').includes(KIND.STREAM_END),
    )
    expect(t.bodyOf('r-small').equals(small)).toBe(true)
    expect(t.sideChannel.uploads).toHaveLength(1)
    const end = t.frames.find(
      (f) => f.header.id === 'r-large' && f.header.kind === KIND.STREAM_END,
    )
    expect(end.header.s3).toEqual({
      key: 'prefix/1',
      get: 'https://get/prefix/1',
      delete: 'https://delete/prefix/1',
    })
    const inline = t.bodyOf('r-large')
    expect(inline.length).toBeLessThanOrEqual(WEB_BODY_BYTES)
    expect(
      Buffer.concat([inline, t.sideChannel.objects.get('prefix/1')]).equals(
        large,
      ),
    ).toBe(true)
    for (const frame of t.frames) {
      expect(frame.body.length).toBeLessThanOrEqual(WEB_BODY_BYTES)
    }
  })

  test('a response larger than one object is sent as objects in order, the rest at its end', async () => {
    const large = patterned(RESPONSE_OBJECT_BYTES + 300_000, 3)
    const t = setup({
      dispatch: async () => ({
        status: 200,
        headers: {},
        body: Readable.from([large]),
      }),
    })
    t.request()
    await waitFor(() => t.kinds().includes(KIND.STREAM_END))
    const pieces = t.frames
      .filter((f) => f.header.kind === KIND.STREAM_DATA)
      .map((f) => t.sideChannel.objects.get(f.header.s3.key))
    const end = t.frames.find((f) => f.header.kind === KIND.STREAM_END)
    expect(end.header.count).toBe(pieces.length)
    const tail = end.header.s3
      ? t.sideChannel.objects.get(end.header.s3.key)
      : Buffer.alloc(0)
    expect(Buffer.concat([...pieces, tail]).equals(large)).toBe(true)
  })

  test('without the deployment bucket a large response goes inline in frames of at most 64 KiB', async () => {
    const large = patterned(200_000, 5)
    const t = setup({
      sideChannel: { enabled: false, reason: 'it is not set up' },
      dispatch: async () => ({
        status: 200,
        headers: {},
        body: Readable.from([large]),
      }),
    })
    t.request()
    await waitFor(() => t.kinds().includes(KIND.STREAM_END))
    expect(t.bodyOf().equals(large)).toBe(true)
    for (const frame of t.frames) {
      expect(frame.body.length).toBeLessThanOrEqual(WEB_BODY_BYTES)
      expect(frame.header.s3).toBeUndefined()
    }
  })

  test('event-stream response stays inline in order, each event sent as it arrives', async () => {
    const body = new PassThrough()
    const t = setup({
      dispatch: async () => ({
        status: 200,
        headers: { 'Content-Type': 'text/event-stream; charset=utf-8' },
        body,
      }),
    })
    t.request({ method: 'GET' })
    await waitFor(() => t.kinds().includes(KIND.RESPONSE_START))
    const events = [
      Buffer.from('data: one\n\n'),
      patterned(50_000, 2),
      patterned(100_000, 4),
      Buffer.from('data: last\n\n'),
    ]
    let sent = 0
    for (const event of events) {
      body.write(event)
      sent += event.length
      // Each event goes out before the next one is written: nothing waits for more.
      await waitFor(() => t.bodyOf().length === sent)
    }
    body.end()
    await waitFor(() => t.kinds().includes(KIND.STREAM_END))
    expect(t.bodyOf().equals(Buffer.concat(events))).toBe(true)
    const data = t.frames.filter((f) => f.header.kind === KIND.STREAM_DATA)
    expect(data.map((f) => f.header.n)).toEqual(data.map((_, n) => n))
    for (const frame of data) {
      expect(frame.header.s3).toBeUndefined()
      expect(frame.body.length).toBeLessThanOrEqual(WEB_BODY_BYTES)
    }
    expect(t.sideChannel.uploads).toEqual([])
    const end = t.frames.at(-1).header
    expect(end).toEqual({ kind: KIND.STREAM_END, id: 'r1', count: data.length })
  })

  test('after stopAccepting, requests get not_in_dev; drain waits for the ones accepted', async () => {
    let finish
    const t = setup({
      dispatch: async () => {
        await new Promise((resolve) => {
          finish = resolve
        })
        return { status: 204, headers: {}, body: Readable.from([]) }
      },
    })
    t.request({ id: 'r-running' })
    await waitFor(() => t.dispatched.length === 1)
    t.relay.stopAccepting()
    t.request({ id: 'r-late' })
    t.send({ kind: KIND.UPLOAD_URL_REQUEST, env: ENV_ID, id: 'r-upload' })
    await waitFor(() => t.kinds('r-late').length && t.kinds('r-upload').length)
    expect(t.kinds('r-late')).toEqual([KIND.NOT_IN_DEV])
    expect(t.kinds('r-upload')).toEqual([KIND.NOT_IN_DEV])
    expect(t.dispatched).toHaveLength(1)
    const draining = t.relay.drain(5_000)
    setTimeout(() => finish(), 20)
    await draining
    expect(t.kinds('r-running')).toEqual([
      KIND.ACCEPTED,
      KIND.RESPONSE_START,
      KIND.STREAM_END,
    ])
  })

  test('a web function outside the session, or a local server that is not running, is not_in_dev', async () => {
    const t = setup({ isServing: (key) => key !== 'web' })
    t.request({ id: 'r-other', fn: 'svc-dev-other' })
    t.request({ id: 'r-down' })
    await waitFor(() => t.kinds('r-other').length && t.kinds('r-down').length)
    expect(t.kinds('r-other')).toEqual([KIND.NOT_IN_DEV])
    expect(t.kinds('r-down')).toEqual([KIND.NOT_IN_DEV])
    expect(t.dispatched).toEqual([])
  })

  test('a request without the role credentials, when none were sent, asks for them', async () => {
    const t = setup()
    t.request({ id: 'r-bare', environment: undefined })
    await waitFor(() => t.kinds('r-bare').length)
    expect(t.kinds('r-bare')).toEqual([KIND.NEED_ENVIRONMENT])
    t.request({ id: 'r-bare', sentAt: Date.now() })
    await waitFor(() => t.kinds('r-bare').includes(KIND.STREAM_END))
    t.request({ id: 'r-next', environment: undefined })
    await waitFor(() => t.kinds('r-next').includes(KIND.STREAM_END))
    expect(t.updates).toEqual([['web', ROLE]])
  })

  test("a --local-only web app's credentials request is answered here: 204 once the role credentials came, never dispatched or recorded", async () => {
    const t = setup({ localOnly: new Set(['web']), isServing: () => false })
    const credentialsRequest = (fields) =>
      t.request({
        method: 'GET',
        path: `${CREDENTIALS_PATH}?t=1`,
        headers: {},
        ...fields,
      })
    // Not the first request of its connection: the bridge is asked for them.
    credentialsRequest({ id: 'c-bare', environment: undefined })
    await waitFor(() => t.kinds('c-bare').length)
    expect(t.kinds('c-bare')).toEqual([KIND.NEED_ENVIRONMENT])
    expect(t.updates).toEqual([])
    credentialsRequest({ id: 'c-bare', sentAt: Date.now() })
    await waitFor(() => t.kinds('c-bare').includes(KIND.STREAM_END))
    expect(t.kinds('c-bare')).toEqual([
      KIND.NEED_ENVIRONMENT,
      KIND.ACCEPTED,
      KIND.RESPONSE_START,
      KIND.STREAM_END,
    ])
    const start = t.frames.find(
      (f) => f.header.id === 'c-bare' && f.header.kind === KIND.RESPONSE_START,
    )
    expect(start.header.status).toBe(204)
    expect(t.updates).toEqual([['web', ROLE]])
    // A refresh with credentials: taken again, answered again.
    credentialsRequest({ id: 'c-again' })
    await waitFor(() => t.kinds('c-again').includes(KIND.STREAM_END))
    expect(t.updates).toEqual([
      ['web', ROLE],
      ['web', ROLE],
    ])
    expect(t.dispatched).toEqual([])
    expect(t.recorder.calls).toEqual([])
    // The same path of a relayed web app is the app's own: dispatched as any other request.
    const relayed = setup()
    relayed.request({ id: 'c-app', method: 'GET', path: CREDENTIALS_PATH })
    await waitFor(() => relayed.kinds('c-app').includes(KIND.STREAM_END))
    expect(relayed.dispatched.map((r) => r.path)).toEqual([CREDENTIALS_PATH])
  })

  test("a --local-only web app's endpoint relays only the credentials request: any other is not_in_dev, never dispatched or recorded", async () => {
    const t = setup({ localOnly: new Set(['web']), isServing: () => true })
    t.request({ id: 'l-other', method: 'GET', path: '/' })
    await waitFor(() => t.kinds('l-other').length)
    t.request({ id: 'l-post', method: 'POST', path: CREDENTIALS_PATH })
    await waitFor(() => t.kinds('l-post').length)
    expect(t.kinds('l-other')).toEqual([KIND.NOT_IN_DEV])
    expect(t.kinds('l-post')).toEqual([KIND.NOT_IN_DEV])
    expect(t.dispatched).toEqual([])
    expect(t.recorder.calls).toEqual([])
  })

  test('a request offered too long ago is expired and never dispatched', async () => {
    const t = setup()
    t.request({ id: 'r-fresh' })
    await waitFor(() => t.kinds('r-fresh').includes(KIND.STREAM_END))
    t.request({ id: 'r-old', sentAt: Date.now() - 2_000 })
    await waitFor(() => t.kinds('r-old').length)
    expect(t.kinds('r-old')).toEqual([KIND.EXPIRED])
    expect(t.dispatched.map((r) => r.id)).toEqual(['r-fresh'])
  })

  test('a dispatch that reaches no server after acceptance is not_in_dev; any other failure is a 502', async () => {
    const t = setup({
      dispatch: async ({ id }) => {
        if (id === 'r-refused') {
          throw Object.assign(
            new Error('connect ECONNREFUSED 127.0.0.1:3000'),
            {
              code: 'ECONNREFUSED',
            },
          )
        }
        throw new Error('socket hang up')
      },
    })
    t.request({ id: 'r-refused' })
    t.request({ id: 'r-failed' })
    await waitFor(
      () =>
        t.kinds('r-refused').length === 2 &&
        t.kinds('r-failed').includes(KIND.STREAM_END),
    )
    expect(t.kinds('r-refused')).toEqual([KIND.ACCEPTED, KIND.NOT_IN_DEV])
    expect(t.kinds('r-failed')).toEqual([
      KIND.ACCEPTED,
      KIND.RESPONSE_START,
      KIND.STREAM_DATA,
      KIND.STREAM_END,
    ])
    const start = t.frames.find(
      (f) =>
        f.header.id === 'r-failed' && f.header.kind === KIND.RESPONSE_START,
    )
    expect(start.header.status).toBe(502)
    expect(t.bodyOf('r-failed').toString()).toMatch(/local server/)
    expect(t.recorder.calls.filter(([what]) => what === 'end')).toEqual(
      expect.arrayContaining([
        [
          'end',
          expect.objectContaining({ id: 'r-refused', outcome: 'not_run' }),
        ],
        ['end', expect.objectContaining({ id: 'r-failed', outcome: 'failed' })],
      ]),
    )
  })

  test('a response body that fails after it started ends with an error type and records the bytes sent', async () => {
    const body = new PassThrough()
    const t = setup({
      dispatch: async () => ({ status: 200, headers: {}, body }),
    })
    t.request()
    await waitFor(() => t.kinds().includes(KIND.RESPONSE_START))
    body.write('partial')
    // The part held so far goes out after a moment without more.
    await waitFor(() => t.bodyOf().toString() === 'partial')
    body.destroy(new Error('the local server went away'))
    await waitFor(() => t.kinds().includes(KIND.STREAM_END))
    const end = t.frames.at(-1).header
    expect(end.errorType).toBe('Runtime.DevModeRelayFailed')
    expect(end.count).toBe(1)
    await waitFor(() => t.recorder.calls.some(([what]) => what === 'end'))
    expect(t.recorder.calls.at(-1)).toEqual([
      'end',
      expect.objectContaining({ outcome: 'failed', status: 200, bytes: 7 }),
    ])
  })

  test('a publish that fails mid event-stream ends the request cleanly: no unhandled rejection, the local response is no longer read', async () => {
    const unhandled = []
    const onUnhandled = (reason) => unhandled.push(reason)
    process.on('unhandledRejection', onUnhandled)
    try {
      const body = new PassThrough()
      let failing = false
      const open = createOpener({ key: KEY })
      const frames = []
      const t = setup({
        dispatch: async () => ({
          status: 200,
          headers: { 'content-type': 'text/event-stream' },
          body,
        }),
        // false: not sent (the connection dropped, or the web pacer closed at the stop).
        publish: async (message) => {
          if (failing) return false
          frames.push(open(message.topic, message.payload))
          return true
        },
      })
      t.request()
      await waitFor(() =>
        frames.some((f) => f.header.kind === KIND.RESPONSE_START),
      )
      body.write('data: 1\n\n')
      await waitFor(() =>
        frames.some((f) => f.header.kind === KIND.STREAM_DATA),
      )
      failing = true
      body.write('data: 2\n\n')
      await waitFor(() => t.recorder.calls.some(([what]) => what === 'end'))
      await settle(50)
      expect(unhandled).toEqual([])
      expect(body.destroyed).toBe(true)
      expect(t.relay.inFlight()).toBe(0)
      expect(t.recorder.calls.at(-1)).toEqual([
        'end',
        expect.objectContaining({ outcome: 'failed', bytes: 9 }),
      ])
    } finally {
      process.off('unhandledRejection', onUnhandled)
    }
  })

  test('a streamed response past 64 KiB keeps streaming: a part followed by a pause goes out before the end', async () => {
    const data = patterned(100 * 1024, 19)
    const body = new PassThrough()
    const t = setup({
      dispatch: async () => ({
        status: 200,
        headers: { 'content-type': 'text/html' },
        body,
      }),
    })
    t.request()
    await waitFor(() => t.kinds().includes(KIND.RESPONSE_START))
    body.write(data.subarray(0, 80 * 1024))
    // More than a frame held through a pause: one object in the bucket.
    await waitFor(() => t.kinds().includes(KIND.STREAM_DATA))
    body.write(data.subarray(80 * 1024))
    // The second part, held through a pause too, goes out inline before the body ends.
    await waitFor(
      () => t.kinds().filter((k) => k === KIND.STREAM_DATA).length === 2,
    )
    expect(t.kinds()).not.toContain(KIND.STREAM_END)
    body.end()
    await waitFor(() => t.kinds().includes(KIND.STREAM_END))
    const parts = t.frames
      .filter((f) => f.header.kind === KIND.STREAM_DATA)
      .sort((a, b) => a.header.n - b.header.n)
    expect(parts[0].header.s3).toBeDefined()
    expect(parts[1].header.s3).toBeUndefined()
    const end = t.frames.find((f) => f.header.kind === KIND.STREAM_END).header
    expect(end).toEqual({ kind: KIND.STREAM_END, id: 'r1', count: 2 })
    expect(
      Buffer.concat([
        t.sideChannel.objects.get(parts[0].header.s3.key),
        parts[1].body,
      ]).equals(data),
    ).toBe(true)
  })

  test('a stop that outlives its drain aborts the requests still running, which end without an error', async () => {
    const unhandled = []
    const onUnhandled = (reason) => unhandled.push(reason)
    process.on('unhandledRejection', onUnhandled)
    try {
      const stream = new PassThrough()
      const signals = []
      const t = setup({
        dispatch: async ({ id, signal }) => {
          signals.push(signal)
          if (id === 'r-hang') return new Promise(() => {})
          return {
            status: 200,
            headers: { 'content-type': 'text/event-stream' },
            body: stream,
          }
        },
      })
      t.request({ id: 'r-hang' })
      t.request({ id: 'r-sse' })
      await waitFor(() => t.kinds('r-sse').includes(KIND.RESPONSE_START))
      stream.write('data: 1\n\n')
      await waitFor(() => t.kinds('r-sse').includes(KIND.STREAM_DATA))
      t.relay.stopAccepting()
      const started = Date.now()
      await t.relay.drain(50)
      expect(Date.now() - started).toBeLessThan(1_000)
      expect(t.relay.inFlight()).toBe(0)
      expect(signals.every((signal) => signal.aborted)).toBe(true)
      expect(stream.destroyed).toBe(true)
      // The open stream is ended with the error type; the one with no answer yet sends nothing.
      expect(t.kinds('r-sse').at(-1)).toBe(KIND.STREAM_END)
      expect(t.kinds('r-hang')).toEqual([KIND.ACCEPTED])
      const ends = t.recorder.calls.filter(([what]) => what === 'end')
      expect(ends).toEqual(
        expect.arrayContaining([
          ['end', expect.objectContaining({ id: 'r-hang', outcome: 'failed' })],
          [
            'end',
            expect.objectContaining({
              id: 'r-sse',
              outcome: 'failed',
              bytes: 9,
            }),
          ],
        ]),
      )
      await settle(20)
      expect(unhandled).toEqual([])
    } finally {
      process.off('unhandledRejection', onUnhandled)
    }
  })

  test('a request body in the deployment bucket is downloaded; one not taken is deleted unread', async () => {
    const sideChannel = fakeSideChannel()
    sideChannel.objects.set('prefix/in-1', patterned(100_000))
    sideChannel.objects.set('prefix/in-2', patterned(100_000))
    const t = setup({ sideChannel })
    t.request({ id: 'r-s3', s3: { key: 'prefix/in-1', versionId: 'v1' } })
    await waitFor(() => t.kinds('r-s3').includes(KIND.STREAM_END))
    expect(t.dispatched[0].body.equals(patterned(100_000))).toBe(true)
    t.relay.stopAccepting()
    t.request({ id: 'r-not', s3: { key: 'prefix/in-2', versionId: 'v1' } })
    await waitFor(() => sideChannel.discarded.length === 1)
    expect(sideChannel.discarded).toEqual(['prefix/in-2'])
  })

  test('a body the deployment bucket could not give is recorded as unknown, so it is not replayed', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sls-dev-t-'))
    try {
      const records = []
      const recorder = createRequestRecorder({
        dir,
        events: { emit: (type, fields) => records.push({ type, ...fields }) },
      })
      // The bridge leaves out transfer-encoding: the headers say nothing of the body.
      const t = setup({ recorder })
      t.request({
        id: 'r-gone',
        s3: { key: 'prefix/missing', versionId: 'v1' },
      })
      await waitFor(() =>
        records.some((record) => record.type === 'request.end'),
      )
      expect(t.kinds('r-gone')).toContain(KIND.NOT_IN_DEV)
      expect(t.dispatched).toEqual([])
      const end = records.find((record) => record.type === 'request.end')
      expect(end).toMatchObject({ outcome: 'not_run', status_code: null })
      const saved = JSON.parse(
        fs.readFileSync(
          path.join(dir, ...end.file.split('/').slice(2)),
          'utf8',
        ),
      )
      expect(saved.request).toMatchObject({
        body: null,
        body_bytes: null,
        body_captured: false,
      })
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })

  test('an upload URL request is answered with a URL from the deployment bucket', async () => {
    const t = setup()
    t.send({ kind: KIND.UPLOAD_URL_REQUEST, env: ENV_ID, id: 'r-up' })
    await waitFor(() => t.kinds('r-up').length)
    expect(t.frames[0].header).toEqual({
      kind: KIND.UPLOAD_URL,
      id: 'r-up',
      upload: expect.objectContaining({ url: expect.any(String) }),
    })
    const off = setup({
      sideChannel: { enabled: false, reason: 'it is not set up' },
    })
    off.send({ kind: KIND.UPLOAD_URL_REQUEST, env: ENV_ID, id: 'r-up' })
    await waitFor(() => off.kinds('r-up').length)
    expect(off.kinds('r-up')).toEqual([KIND.NOT_IN_DEV])
  })

  test('an acceptance that cannot be sent runs nothing', async () => {
    const t = setup({ publish: async () => false })
    t.request()
    await settle(50)
    expect(t.dispatched).toEqual([])
  })
})

describe('routing the session topic between functions and web apps', () => {
  test('requests and the upload URL requests of web bridges go to the web relay, the rest to the functions', () => {
    const seal = createSealer({ key: KEY })
    const toWeb = []
    const toFunctions = []
    const owned = new Set(['e-web'])
    const router = createUpRouter({
      sessionId: SESSION,
      key: KEY,
      web: {
        receive: (topic, payload) => toWeb.push(payload),
        owns: (env) => owned.has(env),
      },
    })
    const frame = (header) => seal(topics.up, header)
    const upFromNew = frame({
      kind: KIND.UPLOAD_URL_REQUEST,
      env: 'e-new',
      id: 'u0',
    })
    // Before the functions' relay listens, every upload URL request is the web relay's.
    router.receive(topics.up, upFromNew)
    expect(toWeb).toEqual([upFromNew])
    router.setOthers((topic, payload) => toFunctions.push(payload))
    const request = frame({ kind: KIND.REQUEST, env: 'e-web', id: 'r1' })
    const upFromWeb = frame({
      kind: KIND.UPLOAD_URL_REQUEST,
      env: 'e-web',
      id: 'u1',
    })
    const upFromFunction = frame({
      kind: KIND.UPLOAD_URL_REQUEST,
      env: 'e-fn',
      id: 'u2',
    })
    const invoke = frame({ kind: KIND.INVOKE, env: 'e-fn', id: 'i1' })
    const ping = Buffer.alloc(0)
    for (const payload of [request, upFromWeb, upFromFunction, invoke]) {
      router.receive(topics.up, payload)
    }
    router.receive(topics.ping, ping)
    expect(toWeb).toEqual([upFromNew, request, upFromWeb])
    expect(toFunctions).toEqual([upFromFunction, invoke, ping])
  })

  test('web frames are paced with the web profile and keep their priority and deadline', async () => {
    const sent = []
    const web = createWebPublish({
      publish: async (message) => {
        sent.push(message)
        return message.topic !== 'late'
      },
      timers: { setTimeout, clearTimeout },
    })
    expect(web.pacing).toEqual(WEB_PACING)
    const deadline = Date.now() + 60_000
    await expect(
      web.publish({
        topic: 't',
        payload: Buffer.from('x'),
        priority: 'acceptance',
        deadline,
      }),
    ).resolves.toBe(true)
    expect(sent[0]).toMatchObject({
      topic: 't',
      priority: 'acceptance',
      deadline,
    })
    // A frame the connection's own pacer dropped was not sent.
    await expect(
      web.publish({ topic: 'late', payload: Buffer.from('x') }),
    ).rejects.toThrow(/not sent/)
    web.close()
    await expect(
      web.publish({ topic: 't', payload: Buffer.from('x') }),
    ).resolves.toBe(false)
  })
})

/**
 * Both ends together: the real web bridge (web/bridge/server.mjs) serving HTTP in-process, its AWS
 * IoT Core connection an in-memory one to this relay, and S3 an in-memory bucket that the bridge
 * reaches with the side channel's presigned URLs and the side channel with its S3 client.
 */
describe('the web relay against the real web bridge', () => {
  const BUCKET = 'deployment-bucket'
  const BUCKET_HOST = `${BUCKET}.s3.us-east-1.amazonaws.com`

  const memoryBucket = () => {
    const objects = new Map()
    let version = 0
    const calls = []
    return {
      objects,
      calls,
      // The side channel's S3 client.
      async send(command) {
        const { Key, VersionId, Body } = command.input
        calls.push(`${command.constructor.name} ${Key}`)
        if (command instanceof PutObjectCommand) {
          version += 1
          objects.set(Key, { body: Buffer.from(Body), version: `v${version}` })
          return { VersionId: `v${version}` }
        }
        if (command instanceof GetObjectCommand) {
          const object = objects.get(Key)
          if (!object || (VersionId && VersionId !== object.version)) {
            throw Object.assign(new Error('NoSuchKey'), { name: 'NoSuchKey' })
          }
          return {
            VersionId: object.version,
            Body: { transformToByteArray: async () => object.body },
          }
        }
        if (command instanceof DeleteObjectCommand) {
          objects.delete(Key)
          return {}
        }
        throw new Error(`unexpected ${command.constructor.name}`)
      },
      // The bridge's HTTP client, with the presigned URLs.
      async http({ method, url, body }) {
        const target = new URL(url)
        if (target.hostname !== BUCKET_HOST) {
          throw new Error(`unexpected request to ${target.hostname}`)
        }
        const objectKey = decodeURIComponent(target.pathname.slice(1))
        calls.push(`${method} ${objectKey}`)
        const empty = (async function* () {})()
        if (method === 'PUT') {
          version += 1
          objects.set(objectKey, {
            body: Buffer.from(body),
            version: `v${version}`,
          })
          return {
            status: 200,
            headers: { 'x-amz-version-id': `v${version}` },
            body: empty,
          }
        }
        if (method === 'GET') {
          const object = objects.get(objectKey)
          return object
            ? {
                status: 200,
                headers: {},
                body: (async function* () {
                  yield object.body
                })(),
              }
            : { status: 404, headers: {}, body: empty }
        }
        if (method === 'DELETE') {
          objects.delete(objectKey)
          return { status: 204, headers: {}, body: empty }
        }
        throw new Error(`unexpected ${method}`)
      },
    }
  }

  const running = []
  afterEach(async () => {
    for (const { bridge, server, relay, webPublish } of running.splice(0)) {
      bridge.close()
      relay.stopAccepting()
      await relay.drain(1_000)
      webPublish.close()
      await new Promise((resolve) => server.close(resolve))
    }
  })

  const startBoth = async ({ dispatch }) => {
    const bucket = memoryBucket()
    const timers = { setTimeout, clearTimeout }
    const sideChannel = createSideChannel({
      s3: bucket,
      bucket: BUCKET,
      region: 'us-east-1',
      service: 'svc',
      stage: 'dev',
      sessionId: SESSION,
      key: KEY,
      deploymentBucket: {},
      credentials: () => ({
        accessKeyId: 'AKIDEXAMPLE',
        secretAccessKey: 'example-secret',
      }),
    })
    let bridgeConnection = null
    // The machine's connection: what it publishes reaches the bridge's down subscription.
    const webPublish = createWebPublish({
      publish: async ({ topic, payload }) => {
        setImmediate(() => bridgeConnection.options.onMessage(topic, payload))
        return true
      },
      timers,
    })
    const debug = []
    const updates = []
    const relay = createWebRelay({
      sessionId: SESSION,
      key: KEY,
      functions: new Map([['svc-dev-web', 'web']]),
      dispatch,
      credentials: { update: (key, values) => updates.push([key, values]) },
      sideChannel,
      publish: webPublish.publish,
      timers,
      logger: { debug: (line) => debug.push(line) },
    })
    const router = createUpRouter({ sessionId: SESSION, key: KEY, web: relay })
    const bridgeLog = []
    const bridge = createBridge({
      env: {
        AWS_LAMBDA_HTTP_ENDPOINT: '127.0.0.1:8080',
        AWS_REGION: 'us-east-1',
        ...ROLE,
        SLS_DEV_SESSION: SESSION,
        SLS_DEV_SESSION_KEY: KEY.toString('base64'),
        SLS_DEV_IOT_ENDPOINT: 'abc123-ats.iot.us-east-1.amazonaws.com',
        SLS_DEV_BROKER_ROLE_ARN:
          'arn:aws:iam::123456789012:role/serverless-dev-broker-us-east-1',
        SLS_DEV_BROKER_EXTERNAL_ID: 'external-id-1',
        SLS_DEV_WEB_FUNCTION: 'svc-dev-web',
      },
      // The bridge's connection: what it publishes on the up topic reaches this machine's relay.
      connect: async (options) => {
        bridgeConnection = {
          options,
          publish: async (topic, payload) => {
            setImmediate(() => router.receive(topic, payload))
          },
          end() {},
        }
        return bridgeConnection
      },
      assumeRole: async () => ({
        accessKeyId: 'ASIABROKER',
        secretAccessKey: 'broker-secret',
        sessionToken: 'broker-token',
        expiration: new Date(Date.now() + 3_600_000),
      }),
      send: bucket.http,
      timers,
      log: (line) => bridgeLog.push(line),
    })
    const server = http.createServer(bridge.handle)
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
    running.push({ bridge, server, relay, webPublish })
    const { port } = server.address()
    const call = (path, { method = 'GET', body, onChunk } = {}) =>
      new Promise((resolve, reject) => {
        const request = http.request(
          {
            host: '127.0.0.1',
            port,
            path,
            method,
            agent: false,
            headers: body ? { 'content-length': String(body.length) } : {},
          },
          (response) => {
            const chunks = []
            response.on('data', (chunk) => {
              chunks.push(chunk)
              onChunk?.(chunk)
            })
            response.on('end', () =>
              resolve({
                status: response.statusCode,
                headers: response.headers,
                body: Buffer.concat(chunks),
              }),
            )
            response.on('error', reject)
          },
        )
        request.on('error', reject)
        request.end(body)
      })
    return { call, bucket, bridgeLog, debug, updates }
  }

  test('2 MB response goes through S3, 30 KB inline, both byte-identical, and a large request body arrives whole', async () => {
    const small = patterned(30 * 1024, 11)
    const large = patterned(2 * 1024 * 1024, 13)
    const upload = patterned(300 * 1024, 17)
    const received = []
    const { call, bucket, bridgeLog, updates } = await startBoth({
      dispatch: async ({ path, body, method }) => {
        received.push({ path, method, body })
        const data = path === '/large' ? large : path === '/echo' ? body : small
        return {
          status: 200,
          headers: {
            'content-type': 'application/octet-stream',
            'x-path': path,
          },
          // Written in 16 KiB pieces, as a server writes it.
          body: Readable.from(
            Array.from({ length: Math.ceil(data.length / 16_384) }, (_, i) =>
              data.subarray(i * 16_384, (i + 1) * 16_384),
            ),
          ),
        }
      },
    })

    const smallAnswer = await call('/small')
    expect(smallAnswer.status).toBe(200)
    expect(smallAnswer.headers['x-path']).toBe('/small')
    expect(smallAnswer.body.equals(small)).toBe(true)
    // Nothing went through the bucket for it.
    expect(bucket.calls).toEqual([])

    const largeAnswer = await call('/large')
    expect(largeAnswer.status).toBe(200)
    expect(largeAnswer.body.length).toBe(large.length)
    expect(largeAnswer.body.equals(large)).toBe(true)
    // Put by the side channel, read and deleted by the bridge with the presigned URLs.
    expect(bucket.calls.map((c) => c.split(' ')[0])).toEqual([
      'PutObjectCommand',
      'GET',
      'DELETE',
    ])
    expect(bucket.objects.size).toBe(0)

    const echoed = await call('/echo', { method: 'POST', body: upload })
    expect(echoed.body.equals(upload)).toBe(true)
    expect(received.at(-1).body.equals(upload)).toBe(true)
    expect(bucket.objects.size).toBe(0)

    expect(updates[0]).toEqual(['web', ROLE])
    expect(bridgeLog.filter((line) => /deployed code/.test(line))).toEqual([])
  })

  test('event-stream response stays inline and reaches the caller in order, event by event', async () => {
    const body = new PassThrough()
    const { call, bucket } = await startBoth({
      dispatch: async () => ({
        status: 200,
        headers: { 'content-type': 'text/event-stream' },
        body,
      }),
    })
    const seen = []
    const answer = call('/events', {
      onChunk: (chunk) => seen.push(chunk.toString()),
    })
    const events = Array.from({ length: 5 }, (_, i) => `data: ${i}\n\n`)
    for (const event of events) {
      body.write(event)
      // The caller has each event before the next one is written.
      await waitFor(
        () =>
          seen.join('') === events.slice(0, events.indexOf(event) + 1).join(''),
      )
    }
    body.end()
    const done = await answer
    expect(done.headers['content-type']).toBe('text/event-stream')
    expect(done.body.toString()).toBe(events.join(''))
    expect(bucket.calls).toEqual([])
  })

  test('a request after stopAccepting runs the deployed code path: the bridge is told not_in_dev at once', async () => {
    const { call, bridgeLog } = await startBoth({
      dispatch: async () => {
        throw new Error('not expected')
      },
    })
    running[0].relay.stopAccepting()
    const started = Date.now()
    const answer = await call('/')
    // No fallback endpoint is set: the bridge answers 503 itself, well inside its window.
    expect(answer.status).toBe(503)
    expect(Date.now() - started).toBeLessThan(2_000)
    expect(bridgeLog.join('\n')).toMatch(/did not take it \(not_in_dev\)/)
  })
})
