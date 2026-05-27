/**
 * Pure builder for the Lambda runtime env-var block.
 *
 * Returns the AWS_LAMBDA_* + LAMBDA_TASK_ROOT + LANG + LD_LIBRARY_PATH +
 * NODE_PATH env block as a plain object. Does NOT mutate `process.env`.
 *
 * Consumers:
 *   - `worker-entry.js` — assigns the result onto its own isolated
 *     `process.env` for the duration of an invocation.
 *   - The forthcoming in-process runner — will snapshot the parent server's
 *     `process.env`, assign this block, run the handler, then restore the
 *     snapshot, so concurrent non-invocation code in the parent process is
 *     not affected.
 *
 * The static container constants (LAMBDA_TASK_ROOT, LAMBDA_RUNTIME_DIR,
 * LANG, LD_LIBRARY_PATH, NODE_PATH) point at paths that do NOT exist on the
 * developer's machine — they mirror the real Lambda execution environment.
 * Handlers that try to read files at /var/task/... will get ENOENT both in
 * Lambda and offline.  Setting these env vars is for parity: code that READS
 * process.env.LAMBDA_TASK_ROOT (e.g. to locate sibling files or to detect
 * "am I running in Lambda?") sees the same values offline as in production.
 *
 * @param {object} context
 * @param {string} context.functionName
 * @param {string} context.memoryLimitInMB - already stringified
 * @param {string} context.invokedFunctionArn
 * @param {string} context.logGroupName
 * @param {string} context.logStreamName
 * @param {string} [context.handler] - raw handler string, e.g. 'src/foo.handler'
 * @param {string} context.region
 * @returns {Record<string, string>} env vars to apply
 */
export function buildLambdaRuntimeEnv(context) {
  const {
    functionName,
    memoryLimitInMB,
    invokedFunctionArn,
    logGroupName,
    logStreamName,
    handler,
    region,
  } = context

  const env = {
    // Dynamic values (per-invocation):
    AWS_LAMBDA_FUNCTION_NAME: functionName,
    // Defensive String() — JSDoc says memoryLimitInMB is pre-stringified,
    // but a future caller forgetting that would silently inject a number
    // into Object.entries(...).map(([k, v]) => `${k}=${v}`) chains and
    // break downstream consumers that string-compare the env value.
    AWS_LAMBDA_FUNCTION_MEMORY_SIZE: String(memoryLimitInMB),
    AWS_LAMBDA_FUNCTION_VERSION: '$LATEST',
    AWS_LAMBDA_INVOKED_FUNCTION_ARN: invokedFunctionArn,
    AWS_LAMBDA_LOG_GROUP_NAME: logGroupName,
    AWS_LAMBDA_LOG_STREAM_NAME: logStreamName,
    AWS_REGION: region,
    AWS_DEFAULT_REGION: region,
    // Static AWS Lambda container constants (see JSDoc above for rationale).
    LAMBDA_TASK_ROOT: '/var/task',
    LAMBDA_RUNTIME_DIR: '/var/runtime',
    LANG: 'en_US.UTF-8',
    LD_LIBRARY_PATH:
      '/usr/local/lib64/node-v4.3.x/lib:/lib64:/usr/lib64:/var/runtime:/var/runtime/lib:/var/task:/var/task/lib:/opt/lib',
    NODE_PATH: '/var/runtime:/var/task:/var/runtime/node_modules',
  }

  // _HANDLER — the raw handler string (e.g. 'src/foo.handler').
  // Handlers that read process.env._HANDLER to detect the entry point
  // (e.g. for dynamic dispatch) see the same value offline as in prod.
  // Reject empty strings — they'd set the env var to '' (which surfaces
  // as "no handler" inside the runtime) rather than omit it.
  if (typeof handler === 'string' && handler.length > 0) {
    env._HANDLER = handler
  }

  return env
}
