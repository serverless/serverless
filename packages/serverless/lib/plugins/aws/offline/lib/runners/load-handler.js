import { pathToFileURL } from 'node:url'

/**
 * Dynamically imports a Lambda handler module and resolves to the named
 * export. Throws a typed Error if the export is missing or not a function so
 * runners can surface a consistent message to the user / parent process.
 *
 * Consumers: worker-entry.js (in a worker thread) and the in-process runner
 * (in the offline server's main process). Both pass an absolute handler
 * path and an exported name (the "handler" portion of `src/foo.handler`).
 *
 * @param {string} handlerPath Absolute path to the handler module file.
 * @param {string} handlerName Named export (e.g. 'handler', 'router').
 * @returns {Promise<Function>}
 * @throws {Error} If the export is missing or not a function. Errors from
 *                 the dynamic import itself are propagated verbatim so
 *                 stack traces point at the user's module.
 */
export async function loadHandler(handlerPath, handlerName) {
  const mod = await import(pathToFileURL(handlerPath).href)
  const handler = mod[handlerName]
  if (typeof handler !== 'function') {
    throw new Error(
      `Handler export "${handlerName}" is not a function in ${handlerPath}`,
    )
  }
  return handler
}
