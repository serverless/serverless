import { afterEach, describe, expect, test } from '@jest/globals'
import http from 'http'
import { Readable } from 'stream'
import {
  createHttpDispatch,
  forwardHeaders,
  notRunningMessage,
} from '../../../../../../../lib/plugins/aws/dev/web/http-dispatch.js'

const open = []
afterEach(async () => {
  for (const server of open.splice(0)) {
    server.closeAllConnections?.()
    await new Promise((resolve) => server.close(resolve))
  }
})

const readAll = async (stream) => {
  const chunks = []
  for await (const chunk of stream) chunks.push(Buffer.from(chunk))
  return Buffer.concat(chunks)
}

/** A local server on 127.0.0.1 that answers with `handler`; resolves its port. */
const listen = async (handler) => {
  const server = http.createServer(handler)
  open.push(server)
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  return server.address().port
}

/** A port nothing listens on. */
const closedPort = async () => {
  const server = http.createServer()
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address()
  await new Promise((resolve) => server.close(resolve))
  return port
}

const fakeServer = (port, serving = true) => ({ port, serving })

const recording = () => {
  const calls = []
  return {
    calls,
    recorder: {
      start: (fields) => calls.push(['start', fields]),
      end: (fields) => calls.push(['end', fields]),
    },
  }
}

const ended = async (calls) => {
  const until = Date.now() + 5_000
  while (!calls.some(([kind]) => kind === 'end')) {
    if (Date.now() > until) throw new Error('timed out waiting for end')
    await new Promise((resolve) => setTimeout(resolve, 5))
  }
}

describe('forwardHeaders', () => {
  test('host rewritten, x-forwarded-* set', () => {
    expect(
      forwardHeaders(
        {
          Host: 'app.example.com',
          Accept: 'text/html',
          Connection: 'keep-alive, x-trace',
          'X-Trace': '1',
          'Keep-Alive': 'timeout=5',
          'Transfer-Encoding': 'chunked',
          Upgrade: 'websocket',
          'Set-Cookie': ['a=1', 'b=2'],
        },
        { localPort: 4321, remoteAddress: '10.0.0.7', proto: 'http' },
      ),
    ).toEqual({
      host: '127.0.0.1:4321',
      accept: 'text/html',
      'set-cookie': ['a=1', 'b=2'],
      'x-forwarded-host': 'app.example.com',
      'x-forwarded-proto': 'http',
      'x-forwarded-for': '10.0.0.7',
    })
  })

  test('keeps what the platform set, appends the caller and drops lambda-web-* headers', () => {
    expect(
      forwardHeaders(
        {
          host: 'abc.lambda-url.us-east-1.on.aws',
          'x-forwarded-for': '203.0.113.9',
          'x-forwarded-proto': 'https',
          'x-forwarded-host': 'shop.example.com',
          'lambda-web-request-id': 'r-1',
          'Lambda-Web-Function-Name': 'web',
        },
        { localPort: 3000, remoteAddress: '198.51.100.2' },
      ),
    ).toEqual({
      host: '127.0.0.1:3000',
      'x-forwarded-for': '203.0.113.9, 198.51.100.2',
      'x-forwarded-proto': 'https',
      'x-forwarded-host': 'shop.example.com',
    })
  })

  test('without a host or a caller address, adds neither', () => {
    expect(forwardHeaders({}, { localPort: 80 })).toEqual({
      host: '127.0.0.1:80',
      'x-forwarded-proto': 'http',
    })
  })
})

describe('createHttpDispatch', () => {
  test('sends the request to the local server and streams its response back', async () => {
    let seen
    const port = await listen(async (req, res) => {
      seen = {
        method: req.method,
        url: req.url,
        headers: req.headers,
        body: (await readAll(req)).toString(),
      }
      res.writeHead(201, { 'content-type': 'text/plain', 'x-a': 'b' })
      res.write('hello ')
      res.end('world')
    })
    const { calls, recorder } = recording()
    const { dispatch } = createHttpDispatch({
      servers: new Map([['site', fakeServer(port)]]),
      recorder,
      now: () => 1000,
    })
    const response = await dispatch({
      key: 'site',
      id: 'r1',
      method: 'POST',
      path: '/items?x=1',
      headers: { host: 'app.example.com', 'content-type': 'text/plain' },
      body: Buffer.from('payload'),
      source: 'relay',
    })
    expect(response.status).toBe(201)
    expect(response.headers['x-a']).toBe('b')
    expect(response.headers['transfer-encoding']).toBeUndefined()
    expect((await readAll(response.body)).toString()).toBe('hello world')
    expect(seen).toMatchObject({
      method: 'POST',
      url: '/items?x=1',
      body: 'payload',
      headers: {
        host: `127.0.0.1:${port}`,
        'x-forwarded-host': 'app.example.com',
        'x-forwarded-proto': 'https',
      },
    })
    // A relayed request is recorded by the relay, not here.
    expect(calls).toEqual([])
  })

  test('streams a request body given as a Readable', async () => {
    let body
    const port = await listen(async (req, res) => {
      body = await readAll(req)
      res.end('ok')
    })
    const { dispatch } = createHttpDispatch({
      servers: new Map([['site', fakeServer(port)]]),
    })
    const big = Buffer.alloc(300 * 1024, 7)
    const response = await dispatch({
      key: 'site',
      id: 'r1',
      method: 'PUT',
      path: '/',
      headers: {},
      body: Readable.from([big.subarray(0, 1000), big.subarray(1000)]),
      source: 'local',
    })
    await readAll(response.body)
    expect(body.equals(big)).toBe(true)
  })

  test('dispatch to a stopped server gives 503', async () => {
    const { calls, recorder } = recording()
    const { dispatch } = createHttpDispatch({
      servers: new Map([['site', fakeServer(3000, false)]]),
      recorder,
      now: () => 50,
    })
    const response = await dispatch({
      key: 'site',
      id: 'r1',
      method: 'GET',
      path: '/',
      headers: {},
      source: 'local',
    })
    expect(response.status).toBe(503)
    expect(response.headers['content-type']).toMatch(/^text\/plain/)
    expect((await readAll(response.body)).toString()).toBe(
      'web app site is not running on this machine',
    )
    expect(notRunningMessage('site')).toBe(
      'web app site is not running on this machine',
    )
    expect(calls.map(([kind, fields]) => [kind, fields.outcome])).toEqual([
      ['start', undefined],
      ['end', 'not_run'],
    ])
    expect(calls[0][1]).toMatchObject({
      id: 'r1',
      key: 'site',
      source: 'local',
    })
    // Not run here: no status code in the record, as for a relayed request.
    expect(calls[1][1]).toMatchObject({ status: null, bytes: 0 })
  })

  test('an unknown web app gives 503 too', async () => {
    const { dispatch } = createHttpDispatch({ servers: new Map() })
    const response = await dispatch({
      key: 'nope',
      id: 'r1',
      method: 'GET',
      path: '/',
      source: 'replay',
    })
    expect(response.status).toBe(503)
  })

  test('a relayed request to a server not serving is left to the deployed code (notRun)', async () => {
    const { dispatch } = createHttpDispatch({
      servers: new Map([['site', fakeServer(3000, false)]]),
    })
    await expect(
      dispatch({
        key: 'site',
        id: 'r1',
        method: 'GET',
        path: '/',
        source: 'relay',
      }),
    ).rejects.toMatchObject({ notRun: true })
  })

  test('a refused connection is ECONNREFUSED and notRun for the relay, 503 for a local request', async () => {
    const port = await closedPort()
    // It served once and stopped listening: `serving` is still true.
    const { dispatch } = createHttpDispatch({
      servers: new Map([['site', fakeServer(port)]]),
    })
    await expect(
      dispatch({
        key: 'site',
        id: 'r1',
        method: 'GET',
        path: '/',
        source: 'relay',
      }),
    ).rejects.toMatchObject({ notRun: true, code: 'ECONNREFUSED' })
    const local = await dispatch({
      key: 'site',
      id: 'r2',
      method: 'GET',
      path: '/',
      source: 'local',
    })
    expect(local.status).toBe(503)
  })

  test('signal aborts the request to the local server and destroys its response', async () => {
    let serverSawClose
    const closed = new Promise((resolve) => (serverSawClose = resolve))
    const port = await listen((req, res) => {
      res.writeHead(200, { 'content-type': 'text/event-stream' })
      res.write('data: 1\n\n')
      res.on('close', serverSawClose)
    })
    const { dispatch } = createHttpDispatch({
      servers: new Map([['site', fakeServer(port)]]),
    })
    const abort = new AbortController()
    const response = await dispatch({
      key: 'site',
      id: 'r1',
      method: 'GET',
      path: '/events',
      headers: {},
      source: 'relay',
      signal: abort.signal,
    })
    abort.abort()
    await closed
    expect(response.body.destroyed).toBe(true)
  })

  test('a signal that aborts before an answer rejects without notRun', async () => {
    const port = await listen(() => {})
    const { dispatch } = createHttpDispatch({
      servers: new Map([['site', fakeServer(port)]]),
    })
    const abort = new AbortController()
    const pending = dispatch({
      key: 'site',
      id: 'r1',
      method: 'GET',
      path: '/',
      source: 'relay',
      signal: abort.signal,
    })
    setTimeout(() => abort.abort(), 20)
    const error = await pending.catch((e) => e)
    expect(error).toBeInstanceOf(Error)
    expect(error.notRun).toBeUndefined()
  })

  test('records a local request with its status, duration and bytes', async () => {
    const port = await listen((req, res) => {
      res.writeHead(200)
      res.end('12345')
    })
    const { calls, recorder } = recording()
    let t = 100
    const { dispatch } = createHttpDispatch({
      servers: new Map([['site', fakeServer(port)]]),
      recorder,
      now: () => (t += 10),
    })
    const response = await dispatch({
      key: 'site',
      id: 'r9',
      method: 'GET',
      path: '/a',
      headers: {},
      source: 'local',
    })
    await readAll(response.body)
    await ended(calls)
    expect(calls).toEqual([
      [
        'start',
        {
          id: 'r9',
          key: 'site',
          method: 'GET',
          path: '/a',
          headers: {},
          source: 'local',
          at: 110,
        },
      ],
      [
        'end',
        {
          id: 'r9',
          key: 'site',
          at: 120,
          durationMs: 10,
          outcome: 'answered',
          status: 200,
          bytes: 5,
        },
      ],
    ])
  })

  test('a recorder that keeps bodies is told the headers and the head of each body, of a relayed request too', async () => {
    const port = await listen(async (req, res) => {
      await readAll(req)
      res.writeHead(201, {
        'content-type': 'text/plain',
        'set-cookie': ['a=1'],
      })
      res.end('created-and-more')
    })
    const notes = []
    const { dispatch } = createHttpDispatch({
      servers: new Map([['site', fakeServer(port)]]),
      recorder: {
        captureBytes: 7,
        start: () => {},
        end: () => {},
        note: (fields) => notes.push(fields),
      },
    })
    for (const [id, source, body] of [
      ['relayed', 'relay', Buffer.from('0123456789')],
      [
        'local',
        'local',
        Readable.from([Buffer.from('01234'), Buffer.from('56789')]),
      ],
    ]) {
      const response = await dispatch({
        key: 'site',
        id,
        method: 'POST',
        path: '/a',
        headers: { authorization: 'Bearer x' },
        body,
        source,
      })
      expect((await readAll(response.body)).toString()).toBe('created-and-more')
    }
    const until = Date.now() + 5_000
    while (
      notes.filter((note) => note.responseBody).length < 2 &&
      Date.now() < until
    ) {
      await new Promise((resolve) => setTimeout(resolve, 5))
    }
    for (const id of ['relayed', 'local']) {
      const of = Object.assign({}, ...notes.filter((note) => note.id === id))
      expect(of).toMatchObject({
        id,
        headers: { authorization: 'Bearer x' },
        response: { status: 201, headers: { 'set-cookie': ['a=1'] } },
      })
      expect(of.requestBody).toEqual({
        head: Buffer.from('0123456'),
        bytes: 10,
      })
      expect(of.responseBody).toEqual({
        head: Buffer.from('created'),
        bytes: 16,
      })
    }
  })
})
