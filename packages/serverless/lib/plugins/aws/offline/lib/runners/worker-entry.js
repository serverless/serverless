import { workerData, parentPort } from 'node:worker_threads'
import { pathToFileURL } from 'node:url'
import { randomBytes } from 'node:crypto'

const { handlerPath, handlerName, event, context, environment } = workerData

// Merge caller-supplied env vars into this worker's process.env
if (environment) {
  Object.assign(process.env, environment)
}

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
// Settle tracking — only post ONE message to the parent (first wins)
// ---------------------------------------------------------------------------

let workerSettled = false

function postSuccess(value) {
  if (workerSettled) return
  workerSettled = true
  parentPort.postMessage({ type: 'success', value })
}

function postError(err) {
  if (workerSettled) return
  workerSettled = true
  parentPort.postMessage({
    type: 'error',
    error: {
      name: err && err.name != null ? err.name : 'Error',
      message: err && err.message != null ? err.message : String(err),
      stack: err && err.stack != null ? err.stack : '',
    },
  })
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

const lambdaContext = {
  callbackWaitsForEmptyEventLoop:
    context?.callbackWaitsForEmptyEventLoop ?? true,
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
      postError(error)
    } else {
      postSuccess(result)
    }
  },
  succeed(value) {
    postSuccess(value)
  },
  fail(error) {
    postError(error instanceof Error ? error : new Error(String(error)))
  },
}

// ---------------------------------------------------------------------------
// Set AWS_LAMBDA_* env vars BEFORE importing the handler module.
// These are set inside the worker thread only — they don't affect the parent
// process (even with SHARE_ENV the writes are local to this thread's process).
// ---------------------------------------------------------------------------

process.env.AWS_LAMBDA_FUNCTION_NAME = functionName
process.env.AWS_LAMBDA_FUNCTION_MEMORY_SIZE = memoryLimitInMB
process.env.AWS_LAMBDA_FUNCTION_VERSION = functionVersion
process.env.AWS_LAMBDA_INVOKED_FUNCTION_ARN = lambdaContext.invokedFunctionArn
process.env.AWS_LAMBDA_LOG_GROUP_NAME = logGroupName
process.env.AWS_LAMBDA_LOG_STREAM_NAME = logStreamName

// ---------------------------------------------------------------------------
// Invoke the handler
// ---------------------------------------------------------------------------

try {
  const mod = await import(pathToFileURL(handlerPath).href)
  const handler = mod[handlerName]

  if (typeof handler !== 'function') {
    throw new TypeError(
      `Handler export "${handlerName}" is not a function in ${handlerPath}`,
    )
  }

  // Invoke the handler, supporting both async/promise and legacy callback styles.
  const result = await new Promise((resolve, reject) => {
    const callback = (err, value) => {
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

  postSuccess(result)
} catch (err) {
  postError(err)
}
