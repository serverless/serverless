import { afterEach, expect, jest, test } from '@jest/globals'
import {
  FORCED_EXIT_WAIT_MS,
  forcedExit,
  forcedExitPending,
  onForcedExit,
} from '@serverless/util/src/forced-exit/index.js'

const fakeProcess = () => {
  const exits = []
  return { exits, exit: (code) => exits.push(code) }
}

/** Timers a test fires by hand. */
const handTimers = () => {
  const due = new Map()
  let next = 0
  return {
    due,
    setTimeout: (fn, ms) => {
      next += 1
      due.set(next, { fn, ms })
      return next
    },
    clearTimeout: (handle) => due.delete(handle),
    fireAll: () => {
      for (const [handle, { fn }] of [...due]) {
        due.delete(handle)
        fn()
      }
    },
  }
}

let dispose = () => {}
afterEach(() => dispose())

test('without a handler the process exits at once', async () => {
  const processRef = fakeProcess()
  const exiting = forcedExit({ code: 3, processRef })
  expect(processRef.exits).toEqual([3])
  await exiting
  expect(forcedExitPending()).toBeNull()
})

test('a handler gets the exit code, and the process exits once it settled', async () => {
  expect(FORCED_EXIT_WAIT_MS).toBe(2_000)
  const processRef = fakeProcess()
  const timers = handTimers()
  let release
  const handler = jest.fn(
    () =>
      new Promise((resolve) => {
        release = resolve
      }),
  )
  dispose = onForcedExit(handler)
  const exiting = forcedExit({ code: 3, processRef, timers })
  await new Promise((resolve) => setImmediate(resolve))
  expect(handler).toHaveBeenCalledWith(3)
  expect(processRef.exits).toEqual([])
  expect(forcedExitPending()).toBe(exiting)
  release()
  await exiting
  expect(processRef.exits).toEqual([3])
  expect(timers.due.size).toBe(0)
})

test('a handler that never settles delays the exit by the bound only', async () => {
  const processRef = fakeProcess()
  const timers = handTimers()
  dispose = onForcedExit(() => new Promise(() => {}))
  const exiting = forcedExit({ code: 0, processRef, timers })
  expect([...timers.due.values()].map(({ ms }) => ms)).toEqual([
    FORCED_EXIT_WAIT_MS,
  ])
  timers.fireAll()
  await exiting
  expect(processRef.exits).toEqual([0])
})

test('a handler that fails still lets the process exit', async () => {
  const processRef = fakeProcess()
  dispose = onForcedExit(async () => {
    throw new Error('sending failed')
  })
  await forcedExit({ code: 3, processRef, timers: handTimers() })
  expect(processRef.exits).toEqual([3])
})

test('a second forced exit while one is under way exits once', async () => {
  const processRef = fakeProcess()
  let release
  dispose = onForcedExit(
    () =>
      new Promise((resolve) => {
        release = resolve
      }),
  )
  const first = forcedExit({ code: 3, processRef, timers: handTimers() })
  const second = forcedExit({ code: 0, processRef, timers: handTimers() })
  expect(second).toBe(first)
  await new Promise((resolve) => setImmediate(resolve))
  release()
  await first
  expect(processRef.exits).toEqual([3])
})

test('a removed handler is not run, and removing an earlier one keeps the current one', async () => {
  const processRef = fakeProcess()
  const earlier = jest.fn()
  const removeEarlier = onForcedExit(earlier)
  const current = jest.fn()
  dispose = onForcedExit(current)
  removeEarlier()
  await forcedExit({ code: 3, processRef, timers: handTimers() })
  expect(earlier).not.toHaveBeenCalled()
  expect(current).toHaveBeenCalledWith(3)
  dispose()
  await forcedExit({ code: 0, processRef })
  expect(current).toHaveBeenCalledTimes(1)
  expect(processRef.exits).toEqual([3, 0])
})
