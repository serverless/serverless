import { describe, expect, jest, test } from '@jest/globals'
import {
  DEFAULT_IDLE_TIMEOUT_MS,
  createIdleTimer,
  idleStopLine,
  idleTimeoutOf,
  withIdleActivity,
} from '../../../../../../../lib/plugins/aws/dev/attach/session-idle.js'
import { manualClock } from '../relay/manual-clock.js'

const timer = (clock, extra = {}) => {
  const onIdle = jest.fn()
  const idle = createIdleTimer({
    timeoutMs: 60_000,
    timers: clock.timers,
    now: clock.now,
    onIdle,
    ...extra,
  })
  return { idle, onIdle }
}

describe('the idle timeout of a detached session', () => {
  test('it fires once after the timeout without activity, and leaves no timer', async () => {
    const clock = manualClock(0)
    const { idle, onIdle } = timer(clock)
    idle.start()
    await clock.advance(59_999)
    expect(onIdle).not.toHaveBeenCalled()
    await clock.advance(1)
    expect(onIdle).toHaveBeenCalledTimes(1)
    await clock.advance(600_000)
    expect(onIdle).toHaveBeenCalledTimes(1)
    expect(clock.live()).toBe(0)
  })

  test('activity postpones it; touches before start do not arm it', async () => {
    const clock = manualClock(0)
    const { idle, onIdle } = timer(clock)
    idle.touch()
    expect(clock.live()).toBe(0)
    idle.start()
    await clock.advance(30_000)
    idle.touch()
    await clock.advance(59_999)
    expect(onIdle).not.toHaveBeenCalled()
    await clock.advance(1)
    expect(onIdle).toHaveBeenCalledTimes(1)
  })

  test('a running invocation is not idle', async () => {
    const clock = manualClock(0)
    let busy = true
    const { idle, onIdle } = timer(clock, { isBusy: () => busy })
    idle.start()
    await clock.advance(60_000)
    expect(onIdle).not.toHaveBeenCalled()
    busy = false
    await clock.advance(60_000)
    expect(onIdle).toHaveBeenCalledTimes(1)
  })

  test('stop leaves no timer behind and it never fires after', async () => {
    const clock = manualClock(0)
    const { idle, onIdle } = timer(clock)
    idle.start()
    idle.stop()
    expect(clock.live()).toBe(0)
    await clock.advance(120_000)
    expect(onIdle).not.toHaveBeenCalled()
  })

  test('only a session process has one: 60m by default, the option, or 0 for none', () => {
    expect(idleTimeoutOf({})).toBeNull()
    expect(idleTimeoutOf({ 'idle-timeout': '5m' })).toBeNull()
    expect(idleTimeoutOf({ 'session-process': true })).toBe(
      DEFAULT_IDLE_TIMEOUT_MS,
    )
    expect(
      idleTimeoutOf({ 'session-process': true, 'idle-timeout': '30m' }),
    ).toBe(1_800_000)
    expect(
      idleTimeoutOf({ 'session-process': true, 'idle-timeout': '0' }),
    ).toBeNull()
  })

  test('an idle timeout under a minute is refused: an open dev wait touches every 30 s', () => {
    for (const value of ['59s', '30s', '1s', '59', '30']) {
      expect(() =>
        idleTimeoutOf({ 'session-process': true, 'idle-timeout': value }),
      ).toThrow(
        expect.objectContaining({
          code: 'DEV_MODE_INVALID_DURATION',
          message:
            'Option "--idle-timeout" must be at least 1m, or 0 to turn it off.',
        }),
      )
    }
    expect(
      idleTimeoutOf({ 'session-process': true, 'idle-timeout': '60s' }),
    ).toBe(60_000)
    expect(
      idleTimeoutOf({ 'session-process': true, 'idle-timeout': '60' }),
    ).toBe(60_000)
    expect(
      idleTimeoutOf({ 'session-process': true, 'idle-timeout': '3600' }),
    ).toBe(3_600_000)
    expect(
      idleTimeoutOf({ 'session-process': true, 'idle-timeout': '0s' }),
    ).toBeNull()
  })

  test('invocation and reload records count as activity; nothing else does', () => {
    const touch = jest.fn()
    const events = {
      emit: jest.fn(() => ({ seq: 1, cursor: 's_x:1' })),
      lastCursor: () => 's_x:1',
    }
    const tracked = withIdleActivity(events, { touch })
    for (const type of [
      'invocation.start',
      'invocation.end',
      'reload.start',
      'reload.end',
    ]) {
      expect(tracked.emit(type, {})).toEqual({ seq: 1, cursor: 's_x:1' })
    }
    tracked.emit('connection.lost', { reason: 'x' })
    tracked.emit('function.mode', {})
    expect(touch).toHaveBeenCalledTimes(4)
    expect(events.emit).toHaveBeenCalledTimes(6)
    expect(tracked.lastCursor()).toBe('s_x:1')
  })

  test('the line it prints when it stops', () => {
    expect(idleStopLine(3_600_000)).toBe(
      'No activity for 1h: Dev Mode stops and restores your functions (--idle-timeout).',
    )
  })
})
