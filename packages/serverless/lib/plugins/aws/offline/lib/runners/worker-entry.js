import { workerData, parentPort } from 'node:worker_threads'
import { pathToFileURL } from 'node:url'

const { handlerPath, handlerName, event, context, environment } = workerData

// Merge caller-supplied env vars into this worker's process.env
if (environment) {
  Object.assign(process.env, environment)
}

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
      returnValue = handler(event, context, callback)
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

  parentPort.postMessage({ type: 'success', value: result })
} catch (err) {
  parentPort.postMessage({
    type: 'error',
    error: {
      name: err && err.name != null ? err.name : 'Error',
      message: err && err.message != null ? err.message : String(err),
      stack: err && err.stack != null ? err.stack : '',
    },
  })
}
