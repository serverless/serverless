import { afterEach, describe, expect, test } from '@jest/globals'
import fs from 'fs'
import os from 'os'
import path from 'path'
import {
  START_GRACE_MS,
  claimSession,
  isSessionLive,
  readSession,
  readToken,
  writeToken,
} from '../../../../../../../lib/plugins/aws/dev/state/session-file.js'
import { countingTimers, testSessionId } from '../attach/fakes.js'

const dirs = []
afterEach(() => {
  for (const dir of dirs.splice(0))
    fs.rmSync(dir, { recursive: true, force: true })
})
const tempDir = () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sls-dev-t-'))
  dirs.push(dir)
  return path.join(dir, '.serverless', 'dev')
}
// The sessions here run in another live process: the test runner's parent.
const record = (id, extra = {}) => ({
  v: 1,
  session_id: id,
  pid: process.ppid,
  state: 'starting',
  stage: 'dev',
  region: 'us-east-1',
  selection: { only: [], skip: [] },
  started_at: new Date().toISOString(),
  control: null,
  ...extra,
})
const modeOf = (file) => fs.statSync(file).mode & 0o777
const onPosix = process.platform === 'win32' ? test.skip : test

describe('claimSession', () => {
  test('creates session.json for the first session, which updates and then deletes it with its token', async () => {
    const dir = tempDir()
    const timers = countingTimers()
    const claim = await claimSession({
      dir,
      record: record(testSessionId(1)),
      timers,
    })
    expect(claim.claimed).toBe(true)
    expect(readSession({ dir })).toMatchObject({
      session_id: testSessionId(1),
      state: 'starting',
    })
    expect(
      claim.update({ state: 'on', ready_at: '2026-10-05T10:40:03.000Z' }),
    ).toBe(true)
    expect(readSession({ dir })).toMatchObject({
      state: 'on',
      ready_at: '2026-10-05T10:40:03.000Z',
    })
    expect(claim.record.state).toBe('on')
    writeToken({ dir, token: 'a'.repeat(64) })
    claim.release()
    expect(fs.existsSync(path.join(dir, 'session.json'))).toBe(false)
    expect(fs.existsSync(path.join(dir, 'control.token'))).toBe(false)
    // Nothing is written after the release.
    expect(claim.update({ state: 'stopping' })).toBe(false)
    expect(fs.existsSync(path.join(dir, 'session.json'))).toBe(false)
    expect(timers.live()).toBe(0)
  })

  onPosix(
    'the session file and the token are readable by their owner only',
    async () => {
      const dir = tempDir()
      const claim = await claimSession({
        dir,
        record: record(testSessionId(1)),
      })
      claim.update({ state: 'on' })
      writeToken({ dir, token: 'b'.repeat(64) })
      expect(modeOf(path.join(dir, 'session.json'))).toBe(0o600)
      expect(modeOf(path.join(dir, 'control.token'))).toBe(0o600)
      expect(fs.readFileSync(path.join(dir, 'control.token'), 'utf8')).toBe(
        'b'.repeat(64),
      )
      expect(readToken({ dir })).toBe('b'.repeat(64))
      claim.release()
    },
  )

  test('a live session in this directory is reported, a stale one is replaced', async () => {
    const dir = tempDir()
    const first = await claimSession({ dir, record: record(testSessionId(1)) })
    // Its process runs and it has no control endpoint yet: it is starting.
    const second = await claimSession({ dir, record: record(testSessionId(2)) })
    expect(second).toEqual({
      claimed: false,
      existing: expect.objectContaining({ session_id: testSessionId(1) }),
    })
    // The same file, once its process is gone.
    writeToken({ dir, token: 'c'.repeat(64) })
    const third = await claimSession({
      dir,
      record: record(testSessionId(3)),
      isAlive: () => false,
    })
    expect(third.claimed).toBe(true)
    expect(readSession({ dir }).session_id).toBe(testSessionId(3))
    expect(readToken({ dir })).toBeNull()
    // The first session's release no longer touches what is not its own.
    first.release()
    expect(readSession({ dir }).session_id).toBe(testSessionId(3))
    third.release()
  })

  test('replacing a stale file never removes the token of a start that claimed the place meanwhile', async () => {
    const dir = tempDir()
    const stalePid = 2_147_483_000
    await claimSession({
      dir,
      record: record(testSessionId(1), { pid: stalePid }),
    })
    writeToken({ dir, token: 'c'.repeat(64) })
    const theirs = record(testSessionId(2))
    let raced = false
    // Another start claims the place, and writes its token, right after this one moved the stale
    // file aside and before it removes the stale token.
    const racing = {
      ...fs,
      rmSync: (file, options) => {
        fs.rmSync(file, options)
        if (!raced && String(file).includes('.stale-')) {
          raced = true
          fs.writeFileSync(
            path.join(dir, 'session.json'),
            JSON.stringify(theirs),
          )
          writeToken({ dir, token: 'b'.repeat(64) })
        }
      },
    }
    const ours = await claimSession({
      dir,
      record: record(testSessionId(3)),
      fs: racing,
      isAlive: (pid) => pid !== stalePid,
    })
    expect(raced).toBe(true)
    expect(ours).toEqual({
      claimed: false,
      existing: expect.objectContaining({ session_id: testSessionId(2) }),
    })
    expect(readToken({ dir })).toBe('b'.repeat(64))
  })

  test('an update never overwrites the record of a start that claims the place between its check and its write', async () => {
    const dir = tempDir()
    const sessionFile = path.join(dir, 'session.json')
    const lockFile = path.join(dir, 'session.lock')
    let armed = false
    let wrote = false
    // Another start that claims the place as claimSession does (only while it can take the lock,
    // it replaces the record with its own) slips in right after the update read the record to
    // check that it is still this session's.
    const racing = {
      ...fs,
      readFileSync: (file, ...rest) => {
        const text = fs.readFileSync(file, ...rest)
        if (armed && file === sessionFile) {
          armed = false
          let fd
          try {
            fd = fs.openSync(lockFile, 'wx')
          } catch {
            return text
          }
          fs.closeSync(fd)
          fs.rmSync(sessionFile)
          fs.writeFileSync(
            sessionFile,
            JSON.stringify(record(testSessionId(2))),
          )
          wrote = true
          fs.rmSync(lockFile)
        }
        return text
      },
    }
    const claim = await claimSession({
      dir,
      record: record(testSessionId(1)),
      fs: racing,
    })
    armed = true
    claim.update({ state: 'on' })
    const final = readSession({ dir })
    if (wrote) {
      // The other start's record stays.
      expect(final.session_id).toBe(testSessionId(2))
    } else {
      expect(final).toMatchObject({ session_id: testSessionId(1), state: 'on' })
    }
    // The other start had to wait: the update holds the lock from its check to its write.
    expect(wrote).toBe(false)
    expect(fs.existsSync(lockFile)).toBe(false)
  })

  test('a lock left by a start that died holding it is taken over once it is old', async () => {
    const dir = tempDir()
    const lockFile = path.join(dir, 'session.lock')
    const claim = await claimSession({ dir, record: record(testSessionId(1)) })
    fs.writeFileSync(lockFile, '')
    const old = new Date(Date.now() - 60_000)
    fs.utimesSync(lockFile, old, old)
    expect(claim.update({ state: 'on' })).toBe(true)
    expect(readSession({ dir })).toMatchObject({ state: 'on' })
    expect(fs.existsSync(lockFile)).toBe(false)
  })

  // The lock checks below wait in real time: past the stale period, and up to the whole wait.
  const LOCK_TEST_TIMEOUT_MS = 15_000

  test(
    'a start right after a start that died holding the lock takes the lock over once it is stale',
    async () => {
      const dir = tempDir()
      const lockFile = path.join(dir, 'session.lock')
      fs.mkdirSync(dir, { recursive: true })
      // Left a moment ago by a start that was killed between taking the lock and releasing it.
      fs.writeFileSync(lockFile, '')
      const claim = await claimSession({
        dir,
        record: record(testSessionId(1)),
      })
      expect(claim.claimed).toBe(true)
      expect(readSession({ dir })).toMatchObject({
        session_id: testSessionId(1),
      })
      expect(fs.existsSync(lockFile)).toBe(false)
    },
    LOCK_TEST_TIMEOUT_MS,
  )

  test(
    'a lock that is held all along is never taken over, and the start fails with session_running',
    async () => {
      const dir = tempDir()
      const lockFile = path.join(dir, 'session.lock')
      fs.mkdirSync(dir, { recursive: true })
      fs.writeFileSync(lockFile, 'holder')
      // Its holder keeps it fresh for as long as the start waits.
      const held = {
        ...fs,
        statSync: (file, ...rest) => {
          if (file === lockFile) fs.utimesSync(lockFile, new Date(), new Date())
          return fs.statSync(file, ...rest)
        },
      }
      const error = await claimSession({
        dir,
        record: record(testSessionId(1)),
        fs: held,
      }).catch((caught) => caught)
      expect(error).toMatchObject({ reason: 'session_running' })
      expect(error.message).toContain('session.lock')
      expect(fs.readFileSync(lockFile, 'utf8')).toBe('holder')
      expect(fs.existsSync(path.join(dir, 'session.json'))).toBe(false)
    },
    LOCK_TEST_TIMEOUT_MS,
  )

  test(
    'a fresh lock moved aside as stale goes back when it cannot be linked back, and its holder keeps it',
    async () => {
      const dir = tempDir()
      const lockFile = path.join(dir, 'session.lock')
      const claim = await claimSession({
        dir,
        record: record(testSessionId(1)),
      })
      fs.writeFileSync(lockFile, 'holder')
      let judgedStale = false
      const restored = []
      const noLinks = {
        ...fs,
        // The lock looks stale once (its holder took it right after the check), and stays fresh.
        statSync: (file, ...rest) => {
          const stats = fs.statSync(file, ...rest)
          if (file !== lockFile) return stats
          if (!judgedStale) {
            judgedStale = true
            return { ...stats, mtimeMs: Date.now() - 60_000 }
          }
          fs.utimesSync(lockFile, new Date(), new Date())
          return fs.statSync(file, ...rest)
        },
        // A file system without hard links.
        linkSync: () => {
          throw Object.assign(new Error('operation not permitted'), {
            code: 'EPERM',
          })
        },
        renameSync: (from, to) => {
          fs.renameSync(from, to)
          if (to === lockFile) restored.push(fs.readFileSync(lockFile, 'utf8'))
        },
      }
      const reopened = await claimSession({
        dir,
        record: record(testSessionId(2)),
        fs: noLinks,
        isAlive: () => true,
        health: async () => testSessionId(1),
      }).catch((caught) => caught)
      expect(judgedStale).toBe(true)
      expect(restored).toEqual(['holder'])
      // The holder's lock is in place all along: the start waited and gave up.
      expect(reopened).toMatchObject({ reason: 'session_running' })
      expect(fs.readFileSync(lockFile, 'utf8')).toBe('holder')
      expect(claim.claimed).toBe(true)
    },
    LOCK_TEST_TIMEOUT_MS,
  )

  test(
    'a fresh lock moved aside as stale never replaces a lock another start took meanwhile',
    async () => {
      const dir = tempDir()
      const lockFile = path.join(dir, 'session.lock')
      const claim = await claimSession({
        dir,
        record: record(testSessionId(1)),
      })
      fs.writeFileSync(lockFile, 'holder')
      let judgedStale = false
      const replaced = []
      const crowded = {
        ...fs,
        statSync: (file, ...rest) => {
          const stats = fs.statSync(file, ...rest)
          if (file === lockFile && !judgedStale) {
            judgedStale = true
            return { ...stats, mtimeMs: Date.now() - 60_000 }
          }
          return stats
        },
        // A third start takes the free place before the moved lock can go back.
        linkSync: (from, to) => {
          if (to === lockFile) fs.writeFileSync(lockFile, 'third')
          return fs.linkSync(from, to)
        },
        renameSync: (from, to) => {
          if (to === lockFile) replaced.push(from)
          fs.renameSync(from, to)
        },
      }
      expect(claim.claimed).toBe(true)
      const updating = await claimSession({
        dir,
        record: record(testSessionId(2)),
        fs: crowded,
        isAlive: () => true,
        health: async () => testSessionId(1),
      })
      expect(judgedStale).toBe(true)
      // The third start's lock is never overwritten by the one that was moved aside.
      expect(replaced).toEqual([])
      expect(updating).toMatchObject({ claimed: false })
    },
    LOCK_TEST_TIMEOUT_MS,
  )

  test('a session whose control endpoint answers with its id is live; a wrong id or no answer is stale', async () => {
    const dir = tempDir()
    const timers = countingTimers()
    const listening = record(testSessionId(1), {
      control: { url: 'http://127.0.0.1:1', token_file: 'control.token' },
    })
    const first = await claimSession({ dir, record: listening })
    const asked = []
    const answering = await claimSession({
      dir,
      record: record(testSessionId(2)),
      health: async ({ record: existing }) => {
        asked.push(existing.session_id)
        return { session_id: testSessionId(1), state: 'on' }
      },
      timers,
    })
    expect(answering.claimed).toBe(false)
    expect(asked).toEqual([testSessionId(1)])
    const wrong = await claimSession({
      dir,
      record: record(testSessionId(3)),
      health: async () => ({ session_id: 's_ffffffffffff' }),
      timers,
    })
    expect(wrong.claimed).toBe(true)
    wrong.update({ control: listening.control })
    const silent = await claimSession({
      dir,
      record: record(testSessionId(4)),
      health: () => new Promise(() => {}),
      timeoutMs: 50,
      timers,
    })
    expect(silent.claimed).toBe(true)
    expect(readSession({ dir }).session_id).toBe(testSessionId(4))
    first.release()
    silent.release()
    expect(timers.live()).toBe(0)
  })

  test('a file that names this process is stale: the session it names is gone, whatever its state', async () => {
    const dir = tempDir()
    fs.mkdirSync(dir, { recursive: true })
    // Containers and CI runners often give every run the same pid.
    fs.writeFileSync(
      path.join(dir, 'session.json'),
      JSON.stringify(record(testSessionId(1), { pid: 4242 })),
    )
    const claim = await claimSession({
      dir,
      record: record(testSessionId(2), { pid: 4242 }),
      isAlive: () => true,
      selfPid: 4242,
    })
    expect(claim.claimed).toBe(true)
    expect(readSession({ dir }).session_id).toBe(testSessionId(2))
    claim.release()
    // By default, this process is the one running the claim.
    const own = await claimSession({
      dir,
      record: record(testSessionId(3), { pid: process.pid }),
    })
    const again = await claimSession({
      dir,
      record: record(testSessionId(4), { pid: process.pid }),
    })
    expect(again.claimed).toBe(true)
    own.release()
    again.release()
  })

  test('a file left empty by a start that died before writing it is stale', async () => {
    const dir = tempDir()
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(path.join(dir, 'session.json'), '')
    // Not a session record: readers see no session.
    expect(readSession({ dir })).toBeNull()
    fs.writeFileSync(path.join(dir, 'session.json'), '{"v":1,')
    expect(readSession({ dir })).toBeNull()
    const timers = countingTimers()
    const claim = await claimSession({
      dir,
      record: record(testSessionId(1)),
      timers,
      // How long a claim waits for a record being written; short, so the test does not wait.
      writtenWaitMs: 20,
    })
    expect(claim.claimed).toBe(true)
    expect(timers.live()).toBe(0)
    claim.release()
  })

  test('two starts racing create one session', async () => {
    const dir = tempDir()
    const results = await Promise.all(
      [testSessionId(1), testSessionId(2), testSessionId(3)].map((id) =>
        claimSession({ dir, record: record(id) }),
      ),
    )
    expect(results.filter((result) => result.claimed)).toHaveLength(1)
    const winner = readSession({ dir }).session_id
    for (const result of results.filter((r) => !r.claimed)) {
      expect(result.existing.session_id).toBe(winner)
    }
  })

  test('two starts racing over a stale file create one session', async () => {
    const dir = tempDir()
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(
      path.join(dir, 'session.json'),
      JSON.stringify(record('s_dead00000000', { pid: 999_999_999 })),
    )
    const results = await Promise.all(
      [testSessionId(1), testSessionId(2)].map((id) =>
        claimSession({ dir, record: record(id) }),
      ),
    )
    expect(results.filter((result) => result.claimed)).toHaveLength(1)
    expect([testSessionId(1), testSessionId(2)]).toContain(
      readSession({ dir }).session_id,
    )
    expect(
      fs.readdirSync(dir).filter((name) => name.includes('.stale-')),
    ).toEqual([])
  })
})

describe('links in the place of the record', () => {
  // A directory outside the service, with a file in it that must stay as it is.
  const outside = () => {
    const target = fs.mkdtempSync(path.join(os.tmpdir(), 'sls-dev-t-'))
    dirs.push(target)
    fs.writeFileSync(path.join(target, 'keep.txt'), 'keep me')
    return target
  }

  test('a link in the place of .serverless/dev is refused: nothing is written through it', async () => {
    const dir = tempDir()
    const target = outside()
    fs.mkdirSync(path.dirname(dir), { recursive: true })
    fs.symlinkSync(target, dir, 'junction')
    await expect(
      claimSession({
        dir,
        record: record(testSessionId(1)),
        timers: countingTimers(),
      }),
    ).rejects.toMatchObject({ code: 'EDEVLINK' })
    expect(() => writeToken({ dir, token: 'a'.repeat(64) })).toThrow(
      expect.objectContaining({ code: 'EDEVLINK' }),
    )
    expect(fs.readdirSync(target)).toEqual(['keep.txt'])
  })

  onPosix(
    'a session.json that is a link is stale, and only the link goes',
    async () => {
      const dir = tempDir()
      const target = path.join(outside(), 'keep.txt')
      // A record of a session that would count as live, outside the service.
      fs.writeFileSync(target, JSON.stringify(record('s_00000000000a')))
      fs.mkdirSync(dir, { recursive: true })
      fs.symlinkSync(target, path.join(dir, 'session.json'))
      expect(readSession({ dir })).toBeNull()
      const claim = await claimSession({
        dir,
        record: record(testSessionId(1)),
        timers: countingTimers(),
        writtenWaitMs: 0,
      })
      expect(claim.claimed).toBe(true)
      expect(fs.lstatSync(path.join(dir, 'session.json')).isFile()).toBe(true)
      expect(JSON.parse(fs.readFileSync(target, 'utf8')).session_id).toBe(
        's_00000000000a',
      )
      claim.release()
    },
  )

  onPosix(
    'an update never writes through a link at a temporary file name',
    async () => {
      const dir = tempDir()
      const target = path.join(outside(), 'keep.txt')
      const claim = await claimSession({
        dir,
        record: record(testSessionId(1)),
        timers: countingTimers(),
      })
      // The name a temporary file would have if it could be predicted.
      fs.symlinkSync(target, path.join(dir, `session.json.${process.pid}.tmp`))
      expect(claim.update({ state: 'on' })).toBe(true)
      expect(fs.readFileSync(target, 'utf8')).toBe('keep me')
      expect(readSession({ dir }).state).toBe('on')
      expect(modeOf(path.join(dir, 'session.json'))).toBe(0o600)
      claim.release()
    },
  )
})

describe('a record without a control endpoint', () => {
  const hoursAgo = (hours) =>
    new Date(Date.now() - hours * 3_600_000).toISOString()

  test('counts as starting only while its state says so, for START_GRACE_MS after its start', async () => {
    const live = (fields) =>
      isSessionLive({ record: record('s_1', fields), isAlive: () => true })
    expect(START_GRACE_MS).toBe(60_000)
    expect(await live({})).toBe(true)
    expect(await live({ started_at: hoursAgo(6) })).toBe(false)
    expect(
      await live({
        started_at: new Date(Date.now() - START_GRACE_MS - 1).toISOString(),
      }),
    ).toBe(false)
    expect(await live({ state: 'on' })).toBe(false)
    expect(await live({ state: 'stopping' })).toBe(false)
    // A session that could not open its endpoint runs while its process does: never replaced.
    expect(await live({ control_unavailable: true })).toBe(true)
    expect(
      await live({
        control_unavailable: true,
        state: 'on',
        started_at: hoursAgo(6),
      }),
    ).toBe(true)
    expect(await live({ started_at: 'not a time' })).toBe(false)
  })

  test('an old one whose pid now names another live process is replaced by the next start', async () => {
    const dir = tempDir()
    fs.mkdirSync(dir, { recursive: true })
    // The pid is the test runner's parent: alive, and no Dev Mode session.
    fs.writeFileSync(
      path.join(dir, 'session.json'),
      JSON.stringify(record('s_000000dead00', { started_at: hoursAgo(6) })),
    )
    const claim = await claimSession({
      dir,
      record: record(testSessionId(2)),
      timers: countingTimers(),
    })
    expect(claim.claimed).toBe(true)
    expect(readSession({ dir }).session_id).toBe(testSessionId(2))
    claim.release()
  })
})

describe('isSessionLive', () => {
  test('needs a running process, then an answer with the same id', async () => {
    const timers = countingTimers()
    const listening = record('s_1', { control: { url: 'http://127.0.0.1:9' } })
    expect(await isSessionLive({ record: null })).toBe(false)
    expect(
      await isSessionLive({
        record: { ...listening, pid: 4242 },
        isAlive: () => true,
        health: async () => ({ session_id: 's_1' }),
        selfPid: 4242,
        timers,
      }),
    ).toBe(false)
    expect(
      await isSessionLive({ record: listening, isAlive: () => false }),
    ).toBe(false)
    expect(
      await isSessionLive({
        record: listening,
        isAlive: () => true,
        health: async () => {
          throw new Error('ECONNREFUSED')
        },
        timers,
      }),
    ).toBe(false)
    expect(
      await isSessionLive({
        record: listening,
        isAlive: () => true,
        health: async () => ({ session_id: 's_1' }),
        timers,
      }),
    ).toBe(true)
    expect(timers.live()).toBe(0)
  })
})
