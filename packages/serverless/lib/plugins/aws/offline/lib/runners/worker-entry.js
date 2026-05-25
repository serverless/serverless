import { workerData, parentPort } from 'node:worker_threads'
import { pathToFileURL } from 'node:url'
import { randomBytes } from 'node:crypto'

const { handlerPath, handlerName } = workerData

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Generates a random hex string. Default 16 bytes → 32-char hex string,
 * matching the format real Lambda log stream IDs use.
 *
 * @param {number} bytes
 * @returns {string}
 */
function randomHexId(bytes = 16) {
  return randomBytes(bytes).toString('hex')
}

/**
 * Formats a Date as YYYY/MM/DD using UTC components.
 * Real Lambda log stream names start with this prefix.
 *
 * @param {Date} date
 * @returns {string}
 */
function formatLogStreamDate(date) {
  const year = date.getUTCFullYear()
  const month = String(date.getUTCMonth() + 1).padStart(2, '0')
  const day = String(date.getUTCDate()).padStart(2, '0')
  return `${year}/${month}/${day}`
}

// ---------------------------------------------------------------------------
// Import the handler module once at startup
// ---------------------------------------------------------------------------

let handler

try {
  const mod = await import(pathToFileURL(handlerPath).href)
  handler = mod[handlerName]

  if (typeof handler !== 'function') {
    parentPort.postMessage({
      type: 'error',
      error: {
        name: 'TypeError',
        message: `Handler export "${handlerName}" is not a function in ${handlerPath}`,
        stack: '',
      },
    })
    // Exit; parent will see the error message before the worker exits.
    process.exit(1)
  }
} catch (importErr) {
  parentPort.postMessage({
    type: 'error',
    error: {
      name: importErr && importErr.name != null ? importErr.name : 'Error',
      message:
        importErr && importErr.message != null
          ? importErr.message
          : String(importErr),
      stack: importErr && importErr.stack != null ? importErr.stack : '',
    },
  })
  process.exit(1)
}

// Signal to the parent that the worker is ready for invocations.
parentPort.postMessage({ type: 'ready' })

// ---------------------------------------------------------------------------
// Per-invocation message loop
// ---------------------------------------------------------------------------

parentPort.on('message', async (msg) => {
  if (msg.type === 'shutdown') {
    process.exit(0)
  }

  if (msg.type !== 'invoke') {
    return
  }

  const { event, context, environment } = msg

  // Apply per-invocation env vars.
  if (environment) {
    Object.assign(process.env, environment)
  }

  // ---------------------------------------------------------------------------
  // Inflate the full Lambda context
  //
  // Inflate deadlineMs (a structured-clone-safe number) into a real function.
  // Functions cannot survive structured-clone (workerData channel), so producers
  // send a numeric deadline and we reconstruct the closure here.
  // ---------------------------------------------------------------------------

  const functionName = context?.functionName
  const functionVersion = '$LATEST'
  const memoryLimitInMB = String(context?.memoryLimitInMB ?? 1024)
  const logGroupName = context?.logGroupName ?? `/aws/lambda/${functionName}`
  const logStreamName =
    context?.logStreamName ??
    `${formatLogStreamDate(new Date())}/[$LATEST]${randomHexId()}`

  // Set AWS_LAMBDA_* env vars for this invocation.
  process.env.AWS_LAMBDA_FUNCTION_NAME = functionName
  process.env.AWS_LAMBDA_FUNCTION_MEMORY_SIZE = memoryLimitInMB
  process.env.AWS_LAMBDA_FUNCTION_VERSION = functionVersion
  process.env.AWS_LAMBDA_INVOKED_FUNCTION_ARN = context?.invokedFunctionArn
  process.env.AWS_LAMBDA_LOG_GROUP_NAME = logGroupName
  process.env.AWS_LAMBDA_LOG_STREAM_NAME = logStreamName

  // Settle tracking — only post ONE message to the parent (first wins).
  let settled = false

  /**
   * Whether the handler set `context.callbackWaitsForEmptyEventLoop = false`.
   * Initialized from the incoming context (defaults to `true` per AWS spec).
   * The handler is allowed to mutate it at any time before calling callback/done/succeed/fail.
   *
   * When `false` and a callback-style settle fires, we post the result message
   * immediately and then exit the worker process so the parent does not have to
   * wait for pending timers/connections to drain.
   *
   * For async/Promise-returning handlers the flag has no effect — the promise
   * resolving IS the termination signal (matching real AWS behavior).
   *
   * @type {boolean}
   */
  let userCallbackWaitsForEmptyEventLoop =
    context?.callbackWaitsForEmptyEventLoop ?? true

  /**
   * Post a success result.  When `callbackWaitsForEmptyEventLoop` is `false`
   * and this is a callback-originated settle, immediately signal the parent to
   * drop this worker and exit the process (matching real Lambda behavior of
   * returning without draining the event loop).
   *
   * @param {unknown} value
   * @param {{ fromCallback?: boolean }} [opts]
   */
  function postSuccess(value, { fromCallback = false } = {}) {
    if (settled) return
    settled = true
    parentPort.postMessage({ type: 'success', value })
    if (fromCallback && userCallbackWaitsForEmptyEventLoop === false) {
      // Notify the parent this is an expected self-exit so it drops the
      // pool entry quietly without treating it as an unexpected crash.
      parentPort.postMessage({ type: 'shutdown-after-invocation' })
      setImmediate(() => process.exit(0))
    }
  }

  /**
   * Post an error result.  Same `callbackWaitsForEmptyEventLoop` handling as
   * `postSuccess`.
   *
   * @param {Error | unknown} err
   * @param {{ fromCallback?: boolean }} [opts]
   */
  function postError(err, { fromCallback = false } = {}) {
    if (settled) return
    settled = true
    parentPort.postMessage({
      type: 'error',
      error: {
        name: err && err.name != null ? err.name : 'Error',
        message: err && err.message != null ? err.message : String(err),
        stack: err && err.stack != null ? err.stack : '',
      },
    })
    if (fromCallback && userCallbackWaitsForEmptyEventLoop === false) {
      parentPort.postMessage({ type: 'shutdown-after-invocation' })
      setImmediate(() => process.exit(0))
    }
  }

  const lambdaContext = {
    /**
     * Mirror of `userCallbackWaitsForEmptyEventLoop`.  The handler may set this
     * to `false` at any point; we read it when the callback fires.
     *
     * Using a getter/setter keeps our local variable in sync if the handler
     * assigns to `context.callbackWaitsForEmptyEventLoop` directly.
     */
    get callbackWaitsForEmptyEventLoop() {
      return userCallbackWaitsForEmptyEventLoop
    },
    set callbackWaitsForEmptyEventLoop(v) {
      userCallbackWaitsForEmptyEventLoop = v
    },
    functionName,
    functionVersion,
    invokedFunctionArn: context?.invokedFunctionArn,
    memoryLimitInMB,
    awsRequestId: context?.awsRequestId,
    logGroupName,
    logStreamName,
    identity: null,
    clientContext: null,
    getRemainingTimeInMillis:
      typeof context?.deadlineMs === 'number'
        ? () => Math.max(0, context.deadlineMs - Date.now())
        : () => 0,
    done(error, result) {
      if (error) {
        postError(error, { fromCallback: true })
      } else {
        postSuccess(result, { fromCallback: true })
      }
    },
    succeed(value) {
      postSuccess(value, { fromCallback: true })
    },
    fail(error) {
      postError(error instanceof Error ? error : new Error(String(error)), {
        fromCallback: true,
      })
    },
  }

  // ---------------------------------------------------------------------------
  // Invoke the handler
  // ---------------------------------------------------------------------------

  // Track whether the handler's settle came from the callback path so we
  // can honor `callbackWaitsForEmptyEventLoop = false` after the await.
  // Declared outside try/catch so it is accessible in both branches.
  let settledViaCallback = false

  try {
    const result = await new Promise((resolve, reject) => {
      const callback = (err, value) => {
        settledViaCallback = true
        if (err) {
          reject(err)
        } else {
          resolve(value)
        }
      }

      let returnValue
      try {
        returnValue = handler(event, lambdaContext, callback)
      } catch (syncErr) {
        reject(syncErr)
        return
      }

      // If the handler returned a thenable, await it (promise / async handler).
      // For the Promise path, callbackWaitsForEmptyEventLoop has no effect —
      // the promise resolving IS the termination signal (matching real Lambda).
      if (returnValue != null && typeof returnValue.then === 'function') {
        Promise.resolve(returnValue).then(resolve, reject)
        return
      }

      // If the handler returned undefined, it may be a callback-style handler —
      // wait for the callback to be invoked.  If the handler returned a plain
      // (non-promise) value, resolve with that value immediately.
      if (returnValue !== undefined) {
        resolve(returnValue)
      }
      // else: callback-style — the callback closure above will settle the promise.
    })

    postSuccess(result, { fromCallback: settledViaCallback })
  } catch (err) {
    postError(err, { fromCallback: settledViaCallback })
  }
})
