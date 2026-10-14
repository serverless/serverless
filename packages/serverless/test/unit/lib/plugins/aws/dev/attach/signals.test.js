import { EventEmitter } from 'events'
import {
  SIGNAL_MERGE_MS,
  installStopHandlers,
} from '../../../../../../../lib/plugins/aws/dev/attach/signals.js'
import { credentialsInvalidError } from '../../../../../../../lib/plugins/aws/dev/attach/aws.js'

const SIGNALS = ['SIGINT', 'SIGTERM', 'SIGHUP']

/** A clock the test moves by hand. */
const handClock = () => {
  let time = 1_790_000_000_000
  return {
    now: () => time,
    advance: (ms) => {
      time += ms
    },
  }
}

const install = (proc, seen, extra = {}) =>
  installStopHandlers({
    processRef: proc,
    onStop: (s) => seen.push(`stop:${s}`),
    onForce: (s) => seen.push(`force:${s}`),
    ...extra,
  })

test('stop signals within 500 ms are one stop', () => {
  expect(SIGNAL_MERGE_MS).toBe(500)
  for (const [first, second, after] of [
    ['SIGTERM', 'SIGTERM', 3],
    ['SIGINT', 'SIGTERM', 50],
    ['SIGTERM', 'SIGINT', 500],
    ['SIGHUP', 'SIGINT', 200],
  ]) {
    const proc = new EventEmitter()
    const clock = handClock()
    const seen = []
    const dispose = install(proc, seen, { now: clock.now })
    proc.emit(first, first)
    clock.advance(after)
    proc.emit(second, second)
    expect(seen).toEqual([`stop:${first}`])
    dispose()
  }
})

test('a second signal after 500 ms still forces', () => {
  const proc = new EventEmitter()
  const clock = handClock()
  const seen = []
  install(proc, seen, { now: clock.now })
  proc.emit('SIGTERM', 'SIGTERM')
  clock.advance(3)
  proc.emit('SIGTERM', 'SIGTERM')
  clock.advance(SIGNAL_MERGE_MS - 3 + 1)
  proc.emit('SIGINT', 'SIGINT')
  expect(seen).toEqual(['stop:SIGTERM', 'force:SIGINT'])
})

// While the CLI's spinner runs in a terminal it reads stdin in raw mode and turns Ctrl+C into a
// SIGINT event with no signal name.
test('a Ctrl+C the spinner passes on, with no signal name, is a SIGINT: it stops, and a later one forces', () => {
  const proc = new EventEmitter()
  const clock = handClock()
  const seen = []
  install(proc, seen, { now: clock.now })
  proc.emit('SIGINT')
  clock.advance(SIGNAL_MERGE_MS + 100)
  proc.emit('SIGINT')
  expect(seen).toEqual(['stop:SIGINT', 'force:SIGINT'])
})

test('the 500 ms are counted from the first signal, not from the last one', () => {
  const proc = new EventEmitter()
  const clock = handClock()
  const seen = []
  install(proc, seen, { now: clock.now })
  proc.emit('SIGINT', 'SIGINT')
  clock.advance(300)
  proc.emit('SIGINT', 'SIGINT')
  clock.advance(300)
  proc.emit('SIGINT', 'SIGINT')
  expect(seen).toEqual(['stop:SIGINT', 'force:SIGINT'])
})

test('a stop that came another way counts as the first: a signal right after it is the same stop, a later one forces', () => {
  const proc = new EventEmitter()
  const clock = handClock()
  const seen = []
  const dispose = install(proc, seen, { now: clock.now })
  dispose.markStopped()
  clock.advance(100)
  proc.emit('SIGTERM', 'SIGTERM')
  expect(seen).toEqual([])
  clock.advance(SIGNAL_MERGE_MS)
  proc.emit('SIGINT', 'SIGINT')
  expect(seen).toEqual(['force:SIGINT'])
  dispose()
})

test('the first signal stops, a later SIGINT or SIGTERM forces once, and dispose removes the handlers', () => {
  const proc = new EventEmitter()
  const clock = handClock()
  const seen = []
  const dispose = install(proc, seen, { now: clock.now })
  proc.emit('SIGTERM', 'SIGTERM')
  clock.advance(SIGNAL_MERGE_MS + 1)
  proc.emit('SIGINT', 'SIGINT')
  proc.emit('SIGHUP', 'SIGHUP')
  proc.emit('SIGTERM', 'SIGTERM')
  expect(seen).toEqual(['stop:SIGTERM', 'force:SIGINT'])
  dispose()
  for (const signal of SIGNALS) expect(proc.listenerCount(signal)).toBe(0)
})

test('a hang-up starts a stop but never forces one', () => {
  const proc = new EventEmitter()
  const clock = handClock()
  const seen = []
  install(proc, seen, { now: clock.now })
  proc.emit('SIGINT', 'SIGINT')
  clock.advance(SIGNAL_MERGE_MS + 1)
  proc.emit('SIGHUP', 'SIGHUP')
  proc.emit('SIGHUP', 'SIGHUP')
  expect(seen).toEqual(['stop:SIGINT'])
  proc.emit('SIGINT', 'SIGINT')
  expect(seen).toEqual(['stop:SIGINT', 'force:SIGINT'])
})

test('a hang-up first starts the stop', () => {
  const proc = new EventEmitter()
  const clock = handClock()
  const seen = []
  install(proc, seen, { now: clock.now })
  proc.emit('SIGHUP', 'SIGHUP')
  clock.advance(SIGNAL_MERGE_MS + 1)
  proc.emit('SIGTERM', 'SIGTERM')
  expect(seen).toEqual(['stop:SIGHUP', 'force:SIGTERM'])
})

test('installing twice on one process is a no-op that returns the same disposer', () => {
  const proc = new EventEmitter()
  const seen = []
  const first = install(proc, seen)
  const second = install(proc, seen)
  expect(second).toBe(first)
  for (const signal of SIGNALS) expect(proc.listenerCount(signal)).toBe(1)
  proc.emit('SIGINT', 'SIGINT')
  expect(seen).toEqual(['stop:SIGINT'])
  first()
  for (const signal of SIGNALS) expect(proc.listenerCount(signal)).toBe(0)
  // After dispose a fresh install works again.
  const third = install(proc, seen)
  expect(third).not.toBe(first)
  third()
})

test('an error thrown by a callback is contained and handed to onError', () => {
  const proc = new EventEmitter()
  const clock = handClock()
  const errors = []
  installStopHandlers({
    processRef: proc,
    now: clock.now,
    onStop: () => {
      throw new Error('stop broke')
    },
    onForce: () => {
      throw new Error('force broke')
    },
    onError: (error) => errors.push(error.message),
  })
  expect(() => proc.emit('SIGINT', 'SIGINT')).not.toThrow()
  clock.advance(SIGNAL_MERGE_MS + 1)
  expect(() => proc.emit('SIGINT', 'SIGINT')).not.toThrow()
  expect(errors).toEqual(['stop broke', 'force broke'])
})

test('a rejected promise from an async callback is contained and handed to onError', async () => {
  const proc = new EventEmitter()
  const clock = handClock()
  const errors = []
  const unhandled = []
  const onUnhandled = (reason) => unhandled.push(reason)
  process.on('unhandledRejection', onUnhandled)
  try {
    const dispose = installStopHandlers({
      processRef: proc,
      now: clock.now,
      onStop: async () => {
        throw new Error('async stop broke')
      },
      onForce: async () => {
        throw new Error('async force broke')
      },
      onError: (error) => errors.push(error.message),
    })
    proc.emit('SIGINT', 'SIGINT')
    clock.advance(SIGNAL_MERGE_MS + 1)
    proc.emit('SIGINT', 'SIGINT')
    await new Promise((resolve) => setImmediate(resolve))
    expect(errors).toEqual(['async stop broke', 'async force broke'])
    expect(unhandled).toEqual([])
    dispose()
  } finally {
    process.off('unhandledRejection', onUnhandled)
  }
})

test('without onError a failing stop is reported on stderr with the way to restore', async () => {
  const proc = new EventEmitter()
  const written = []
  proc.stderr = { write: (text) => written.push(text) }
  const dispose = installStopHandlers({
    processRef: proc,
    onStop: async () => {
      throw new Error('stop broke')
    },
    onForce: () => {},
  })
  expect(() => proc.emit('SIGTERM', 'SIGTERM')).not.toThrow()
  await new Promise((resolve) => setImmediate(resolve))
  expect(written.join('')).toContain('stop broke')
  expect(written.join('')).toContain('serverless dev restore')
  dispose()
})

test('without onError, rejected credentials are reported with the AWS message and the advice once', async () => {
  const proc = new EventEmitter()
  const written = []
  proc.stderr = { write: (text) => written.push(text) }
  const rejected = credentialsInvalidError(
    Object.assign(
      new Error('The security token included in the request is expired'),
      {
        name: 'ExpiredTokenException',
      },
    ),
    'eu-west-1',
    { source: 'profile', profile: 'dev' },
  )
  const dispose = installStopHandlers({
    processRef: proc,
    onStop: async () => {
      throw rejected
    },
    onForce: () => {},
  })
  proc.emit('SIGTERM', 'SIGTERM')
  await new Promise((resolve) => setImmediate(resolve))
  expect(written.join('')).toBe(
    `Dev Mode could not stop cleanly (The security token included in the request is expired). ${rejected.advice} Run "serverless dev restore" to restore your functions.\n`,
  )
  expect(written.join('').match(/The credentials come from/g)).toHaveLength(1)
  dispose()
})

test('the default report never throws, even when stderr is gone', () => {
  const proc = new EventEmitter()
  proc.stderr = {
    write: () => {
      throw Object.assign(new Error('write EIO'), { code: 'EIO' })
    },
  }
  const dispose = installStopHandlers({
    processRef: proc,
    onStop: () => {
      throw new Error('stop broke')
    },
    onForce: () => {},
  })
  expect(() => proc.emit('SIGHUP', 'SIGHUP')).not.toThrow()
  dispose()
})
