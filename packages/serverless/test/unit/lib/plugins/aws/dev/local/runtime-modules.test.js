// The laptop runtime is split into modules with one job each; the facade keeps every export it had.
import * as runtime from '../../../../../../../lib/plugins/aws/dev/local/runtime.js'
import * as replies from '../../../../../../../lib/plugins/aws/dev/local/replies.js'
import * as resources from '../../../../../../../lib/plugins/aws/dev/local/runtime-resources.js'
import * as pool from '../../../../../../../lib/plugins/aws/dev/local/worker-pool.js'
import * as dispatch from '../../../../../../../lib/plugins/aws/dev/local/dispatch.js'

describe('the laptop runtime modules', () => {
  test('runtime.js keeps its exports', () => {
    expect(Object.keys(runtime).sort()).toEqual([
      'DEADLINE_GRACE_MS',
      'WORKER_IDLE_MS',
      'WORKER_STOP_GRACE_MS',
      'createLocalRuntime',
    ])
  })

  test("replies are Lambda's", () => {
    expect(replies.TIMED_OUT).toBe('Sandbox.Timedout')
    expect(replies.timeoutMessage('r-1', 3)).toBe(
      'RequestId: r-1 Error: Task timed out after 3.00 seconds',
    )
    expect(JSON.parse(replies.errorReply('Runtime.Unknown', 'x').body)).toEqual(
      { errorType: 'Runtime.Unknown', errorMessage: 'x' },
    )
    expect(
      replies.exitReply({ requestId: 'r', code: 2, kind: 'error' }).errorType,
    ).toBe('Runtime.ExitError')
    expect(replies.parseEvent(Buffer.from('{"a":1}'))).toEqual({ a: 1 })
    expect(replies.parseEvent(Buffer.from('not json'))).toBeUndefined()
  })

  test('each part exports what the runtime composes', () => {
    expect(typeof resources.openRuntimeResources).toBe('function')
    expect(typeof pool.createWorkerPool).toBe('function')
    expect(typeof dispatch.createDispatch).toBe('function')
  })
})
