// The session is split into modules with one job each; the facade keeps every export it had.
import * as session from '../../../../../../../lib/plugins/aws/dev/attach/session.js'
import * as support from '../../../../../../../lib/plugins/aws/dev/attach/session-support.js'
import * as stop from '../../../../../../../lib/plugins/aws/dev/attach/session-stop.js'
import * as restore from '../../../../../../../lib/plugins/aws/dev/attach/session-restore.js'
import * as watch from '../../../../../../../lib/plugins/aws/dev/attach/session-watch.js'
import * as preflight from '../../../../../../../lib/plugins/aws/dev/attach/session-preflight.js'
import * as attach from '../../../../../../../lib/plugins/aws/dev/attach/session-attach.js'
import * as run from '../../../../../../../lib/plugins/aws/dev/attach/session-run.js'

describe('the session modules', () => {
  test('session.js keeps its exports', () => {
    expect(Object.keys(session).sort()).toEqual([
      'RESTORE_TIMEOUT_MS',
      'WATCH_FAILURES_BEFORE_WARNING',
      'WATCH_INTERVAL_MS',
      'defaultOwner',
      'newSessionId',
      'runDevSession',
    ])
  })

  test('each part exports what the session composes', () => {
    expect(Object.keys(support).sort()).toEqual(
      expect.arrayContaining([
        'CANCELLED',
        'GLOBAL_TIMERS',
        'OFF_UNCHANGED',
        'TIMED_OUT',
        'defaultOwner',
        'guardStreams',
        'guardedLogger',
        'guardedProgress',
        'newSessionId',
        'newSessionKey',
        'quiet',
        'within',
      ]),
    )
    expect(typeof stop.createStopControl).toBe('function')
    expect(typeof restore.createRestore).toBe('function')
    expect(typeof restore.removeService).toBe('function')
    expect(typeof watch.createAttachmentWatch).toBe('function')
    expect(Object.keys(preflight).sort()).toEqual([
      'createApproval',
      'createLayerLambda',
      'nothingToAttachError',
      'refuseProtectedStage',
      'runPreflight',
      'stackExistsWith',
    ])
    expect(Object.keys(attach).sort()).toEqual([
      'attachAll',
      'detectRuntimes',
      'ensureAccountSetup',
      'publishMissingLayers',
      'readLiveFunctions',
    ])
    expect(Object.keys(run).sort()).toEqual([
      'createRunState',
      'endSession',
      'startRunning',
      'waitForStop',
    ])
  })

  test('within settles with TIMED_OUT, CANCELLED or the value, and leaves no timer', async () => {
    const live = new Set()
    const timers = {
      setTimeout: (fn, ms) => {
        const h = setTimeout(() => {
          live.delete(h)
          fn()
        }, ms)
        live.add(h)
        return h
      },
      clearTimeout: (h) => {
        live.delete(h)
        clearTimeout(h)
      },
    }
    expect(await support.within(new Promise(() => {}), 10, timers)).toBe(
      support.TIMED_OUT,
    )
    const control = {}
    const cancelled = support.within(
      new Promise(() => {}),
      60_000,
      timers,
      control,
    )
    control.cancel()
    expect(await cancelled).toBe(support.CANCELLED)
    expect(await support.within(Promise.resolve(7), 60_000, timers)).toBe(7)
    expect(live.size).toBe(0)
  })
})
