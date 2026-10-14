import { afterEach, describe, expect, test } from '@jest/globals'
import fs from 'fs'
import net from 'net'
import os from 'os'
import path from 'path'
import {
  connectToSession,
  healthOf,
  loopbackFetch,
  loopbackUrlOf,
} from '../../../../../../../lib/plugins/aws/dev/control/client.js'
import {
  openSessionControl,
  startControlServer,
} from '../../../../../../../lib/plugins/aws/dev/control/server.js'
import {
  claimSession,
  readSession,
  writeToken,
} from '../../../../../../../lib/plugins/aws/dev/state/session-file.js'
import { countingTimers, testSessionId } from '../attach/fakes.js'

const dirs = []
const servers = []
afterEach(async () => {
  for (const server of servers.splice(0)) await server.close()
  for (const dir of dirs.splice(0))
    fs.rmSync(dir, { recursive: true, force: true })
})
const serviceDir = () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sls-dev-t-'))
  dirs.push(dir)
  return dir
}
const devDir = (dir) => path.join(dir, '.serverless', 'dev')
const record = (extra = {}) => ({
  v: 1,
  session_id: testSessionId(1),
  pid: process.pid,
  state: 'on',
  stage: 'dev',
  region: 'us-east-1',
  control: null,
  ...extra,
})
const handlers = (calls = []) => ({
  health: () => ({ state: 'on' }),
  status: () => ({ state: 'on', functions: [] }),
  stop: (body) => calls.push(['stop', body]),
  replay: (body) => {
    if (body.request_id === 'gone') {
      throw Object.assign(new Error('No invocation gone is kept.'), {
        reason: 'invocation_not_found',
      })
    }
    return { request_id: 'r2', replay_of: body.request_id }
  },
  touch: () => calls.push(['touch']),
})
/** A loopback port nothing listens on: bound once, then closed. */
const closedPort = async () => {
  const server = net.createServer()
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address()
  await new Promise((resolve) => server.close(resolve))
  return port
}
const listening = async (
  dir,
  extraHandlers = {},
  sessionId = testSessionId(1),
) => {
  const claim = await claimSession({
    dir: devDir(dir),
    record: record({ session_id: sessionId }),
  })
  const calls = []
  const server = await openSessionControl({
    dir: devDir(dir),
    sessionFile: claim,
    sessionId,
    handlers: { ...handlers(calls), ...extraHandlers },
  })
  servers.push(server)
  return { claim, server, calls }
}

describe('openSessionControl', () => {
  test('a record that cannot take the address closes the endpoint and fails', async () => {
    const dir = devDir(serviceDir())
    fs.mkdirSync(dir, { recursive: true })
    let url = null
    // The session file is no longer writable, or no longer this session's.
    const sessionFile = {
      update: (patch) => {
        url = patch.control?.url ?? url
        return false
      },
    }
    const timers = countingTimers()
    await expect(
      openSessionControl({
        dir,
        sessionFile,
        sessionId: testSessionId(1),
        handlers: handlers(),
        timers,
      }),
    ).rejects.toThrow(
      'its address could not be written to .serverless/dev/session.json',
    )
    expect(url).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/)
    // Nothing listens there any more.
    await expect(loopbackFetch(`${url}/v1/health`)).rejects.toThrow()
    expect(timers.live()).toBe(0)
  })
})

describe('connectToSession', () => {
  test('returns a client for the live session of the directory', async () => {
    const dir = serviceDir()
    const { calls } = await listening(dir)
    const timers = countingTimers()
    const session = await connectToSession({ serviceDir: dir, timers })
    expect(session.record.session_id).toBe(testSessionId(1))
    expect(await session.status()).toEqual({
      status: 200,
      body: { state: 'on', functions: [] },
    })
    expect(await session.stop({ keep: true })).toEqual({
      status: 202,
      body: { stopping: true },
    })
    expect(await session.replay('3f2a9c1e')).toEqual({
      status: 200,
      body: { request_id: 'r2', replay_of: '3f2a9c1e' },
    })
    // Any HTTP answer resolves; the caller reads its status.
    expect(await session.replay('gone')).toEqual({
      status: 404,
      body: {
        reason: 'invocation_not_found',
        message: 'No invocation gone is kept.',
      },
    })
    expect(await session.touch()).toEqual({ status: 204, body: null })
    expect(calls).toEqual([
      ['touch'],
      ['stop', { keep: true }],
      ['touch'],
      ['touch'],
      ['touch'],
    ])
    expect(timers.live()).toBe(0)
  })

  test('returns null without a session file, a running process, a token, or the same session id', async () => {
    expect(await connectToSession({ serviceDir: undefined })).toBeNull()
    const dir = serviceDir()
    expect(await connectToSession({ serviceDir: dir })).toBeNull()
    await listening(dir)
    expect(
      await connectToSession({ serviceDir: dir, isAlive: () => false }),
    ).toBeNull()
    const token = fs.readFileSync(
      path.join(devDir(dir), 'control.token'),
      'utf8',
    )
    fs.rmSync(path.join(devDir(dir), 'control.token'))
    expect(await connectToSession({ serviceDir: dir })).toBeNull()
    writeToken({ dir: devDir(dir), token: 'f'.repeat(64) })
    expect(await connectToSession({ serviceDir: dir })).toBeNull()
    writeToken({ dir: devDir(dir), token })
    expect(await connectToSession({ serviceDir: dir })).not.toBeNull()
  })

  test('a session that answers with another id, or not in time, is not this one', async () => {
    const dir = serviceDir()
    const { claim } = await listening(dir)
    const other = await startControlServer({
      sessionId: 's_ffffffffffff',
      token: fs.readFileSync(path.join(devDir(dir), 'control.token'), 'utf8'),
      handlers: handlers(),
    })
    servers.push(other)
    claim.update({ control: { url: other.url, token_file: 'control.token' } })
    expect(await connectToSession({ serviceDir: dir })).toBeNull()
    const silent = await startControlServer({
      sessionId: testSessionId(1),
      token: fs.readFileSync(path.join(devDir(dir), 'control.token'), 'utf8'),
      handlers: { ...handlers(), health: () => new Promise(() => {}) },
    })
    servers.push(silent)
    claim.update({ control: { url: silent.url, token_file: 'control.token' } })
    const timers = countingTimers()
    expect(
      await connectToSession({ serviceDir: dir, timeoutMs: 50, timers }),
    ).toBeNull()
    expect(timers.live()).toBe(0)
  })

  test('a health check that gets no answer is asked once more before the session counts as not running', async () => {
    const dir = serviceDir()
    await listening(dir)
    const asked = []
    // The endpoint refuses the first connection (it is just starting to listen), then answers.
    const flaky = async (url, init) => {
      asked.push(url)
      if (asked.length === 1) {
        throw Object.assign(new Error('connect ECONNREFUSED'), {
          code: 'ECONNREFUSED',
        })
      }
      return loopbackFetch(url, init)
    }
    const timers = countingTimers()
    const session = await connectToSession({
      serviceDir: dir,
      fetch: flaky,
      timers,
      retryMs: 10,
    })
    expect(session?.record.session_id).toBe(record().session_id)
    expect(asked).toHaveLength(2)
    expect(timers.live()).toBe(0)
  })

  test('with no retry, a health check that gets no answer is asked once', async () => {
    const dir = serviceDir()
    await listening(dir)
    let asked = 0
    const refusing = async () => {
      asked += 1
      throw Object.assign(new Error('connect ECONNREFUSED'), {
        code: 'ECONNREFUSED',
      })
    }
    const timers = countingTimers()
    expect(
      await connectToSession({
        serviceDir: dir,
        fetch: refusing,
        timers,
        retryMs: 0,
      }),
    ).toBeNull()
    expect(asked).toBe(1)
    expect(timers.live()).toBe(0)
  })

  test('another session answering is not asked again', async () => {
    const dir = serviceDir()
    await listening(dir)
    const asked = []
    const other = async (url) => {
      asked.push(url)
      return {
        status: 200,
        json: async () => ({ session_id: 's_ffffffffffff' }),
      }
    }
    expect(
      await connectToSession({ serviceDir: dir, fetch: other, retryMs: 10 }),
    ).toBeNull()
    expect(asked).toHaveLength(1)
  })

  test('a replay that outlives its time limit rejects with an abort, and leaves no timer', async () => {
    const dir = serviceDir()
    await listening(dir, { replay: () => new Promise(() => {}) })
    const timers = countingTimers()
    const session = await connectToSession({ serviceDir: dir, timers })
    // 50 ms is the limit under test, not a sleep.
    await expect(
      session.replay('3f2a9c1e', { timeoutMs: 50 }),
    ).rejects.toMatchObject({ name: 'AbortError' })
    expect(timers.live()).toBe(0)
  })
})

test('healthOf asks the endpoint a record names, with the token of its directory', async () => {
  const dir = serviceDir()
  await listening(dir)
  const health = healthOf({ dir: devDir(dir) })
  expect(await health({ record: readSession({ dir: devDir(dir) }) })).toEqual({
    session_id: testSessionId(1),
    state: 'on',
  })
  expect(await health({ record: { control: null } })).toBeNull()
  // An endpoint nobody listens on is no answer, not a failure.
  const port = await closedPort()
  expect(
    await health({
      record: { control: { url: `http://127.0.0.1:${port}` } },
    }),
  ).toBeNull()
})

test('the control token is only in control.token', async () => {
  const dir = serviceDir()
  await listening(dir)
  const token = fs.readFileSync(path.join(devDir(dir), 'control.token'), 'utf8')
  expect(token).toMatch(/^[0-9a-f]{64}$/)
  const holders = fs
    .readdirSync(devDir(dir))
    .filter((name) =>
      fs.readFileSync(path.join(devDir(dir), name), 'utf8').includes(token),
    )
  expect(holders).toEqual(['control.token'])
  expect(readSession({ dir: devDir(dir) }).control).toEqual({
    url: expect.stringMatching(/^http:\/\/127\.0\.0\.1:\d+$/),
    token_file: 'control.token',
  })
  if (process.platform !== 'win32') {
    expect(
      fs.statSync(path.join(devDir(dir), 'control.token')).mode & 0o777,
    ).toBe(0o600)
  }
})

test('an endpoint that is not on this machine is never asked: the token stays here', async () => {
  const dir = serviceDir()
  const { claim, server } = await listening(dir)
  const port = new URL(server.url).port
  const asked = []
  const fetch = async (url) => {
    asked.push(url)
    return { status: 200, json: async () => ({ session_id: testSessionId(1) }) }
  }
  for (const url of [
    `http://attacker.example:${port}`,
    `https://127.0.0.1:${port}`,
    `http://127.0.0.1:${port}/v1`,
    `http://user@127.0.0.1:${port}`,
    `http://127.0.0.2:${port}`,
    'http://127.0.0.1:0',
    'http://127.0.0.1:70000',
    'http://127.0.0.1',
  ]) {
    claim.update({ control: { url, token_file: 'control.token' } })
    expect(await connectToSession({ serviceDir: dir, fetch })).toBeNull()
    expect(
      await healthOf({ dir: devDir(dir), fetch })({
        record: readSession({ dir: devDir(dir) }),
      }),
    ).toBeNull()
  }
  expect(asked).toEqual([])
  // localhost:<port> is this machine too, asked at the address the endpoint listens on (on some
  // hosts localhost resolves to ::1 first).
  expect(loopbackUrlOf({ control: { url: `http://localhost:${port}` } })).toBe(
    `http://127.0.0.1:${port}`,
  )
  claim.update({
    control: { url: `http://localhost:${port}`, token_file: 'control.token' },
  })
  expect(await connectToSession({ serviceDir: dir })).not.toBeNull()
})
