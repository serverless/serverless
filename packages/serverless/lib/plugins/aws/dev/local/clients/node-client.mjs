/**
 * Runs a Lambda handler on the developer's machine for Serverless Framework Dev Mode.
 *
 * The counterpart of the Lambda Node.js runtime interface client: it speaks the Lambda Runtime API
 * that Dev Mode serves on loopback (AWS_LAMBDA_RUNTIME_API), imports the handler once (the init
 * phase), then runs one invocation at a time until that API goes away. One process stands for one
 * Lambda execution environment, so module state lives as long as it would in Lambda.
 *
 * argv[2] is JSON: { handlerFile, exportPath, taskRoot, serviceDir, deployedRuntime, colors,
 * parentPid, ownGroup }; exportPath is null for a handler without a dot.
 * Runs on every Node.js version the CLI supports (18 and later) and has no dependencies.
 */
import fs from 'node:fs'
import http from 'node:http'
import net from 'node:net'
import path from 'node:path'
import { Writable } from 'node:stream'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { formatWithOptions } from 'node:util'

const config = JSON.parse(process.argv[2] ?? '{}')
const [authority, ...prefix] = String(
  process.env.AWS_LAMBDA_RUNTIME_API ?? '',
).split('/')
const separator = authority.lastIndexOf(':')
const host = authority.slice(0, separator)
const port = Number(authority.slice(separator + 1))
const API = `${prefix.length ? `/${prefix.join('/')}` : ''}/2018-06-01/runtime`
const agent = new http.Agent({ keepAlive: true })

const STREAMING = Symbol.for('aws.lambda.runtime.handler.streaming')
const PRELUDE_CONTENT_TYPE =
  'application/vnd.awslambda.http-integration-response'
const GONE = new Set([
  'ECONNREFUSED',
  'ECONNRESET',
  'EPIPE',
  'EHOSTUNREACH',
  'ENOTFOUND',
])

// Lambda removed callback-style handlers with Node.js 24: from there a handler gets (event, context).
const deployedMajor = Number(
  /^nodejs(\d+)/.exec(String(config.deployedRuntime ?? ''))?.[1] ?? 0,
)
const passesCallback = deployedMajor > 0 && deployedMajor < 24

// Once the CLI that started this process is gone, nothing will ever invoke it. The CLI passes its
// pid, so a CLI that died before this process started is noticed too. Started by the CLI itself,
// this process is adopted away when the CLI ends; started through a launcher that stays in
// between, it asks whether the CLI still runs. On Windows neither works (no adoption, and
// signalling is not a liveness check there): the Runtime API going away ends the process instead.
const expectedParent =
  Number.isInteger(config.parentPid) && config.parentPid > 0
    ? config.parentPid
    : process.ppid
const startedByParent = process.ppid === expectedParent
const parentGone = () => {
  if (startedByParent) return process.ppid !== expectedParent
  if (process.platform === 'win32') return false
  try {
    process.kill(expectedParent, 0)
    return false
  } catch (error) {
    // EPERM: the pid now belongs to another user's process, so the CLI is gone.
    return error.code === 'ESRCH' || error.code === 'EPERM'
  }
}
// Leaving: on POSIX the CLI starts this process as the leader of its own process group and says so
// with ownGroup, so the whole group goes, and with it whatever the handler started. A process
// group whose id is this pid can only be this process's own; elsewhere the process alone exits.
const leave = () => {
  if (config.ownGroup === true && process.platform !== 'win32') {
    try {
      process.kill(-process.pid, 'SIGKILL')
    } catch {
      // Not a group leader after all: exit alone below.
    }
  }
  process.exit(0)
}
setInterval(() => {
  if (parentGone()) leave()
}, 1000).unref()

// The CLI's Runtime API listener goes away with the CLI, on every platform. A handler stuck in its
// init or in an invocation that never settles makes no API call that would fail, so a connect to
// the listener every 2 s checks: two refused in a row mean the CLI is gone. A connect that is slow
// or times out is a busy CLI, not a gone one. Windows retries a refused loopback connect for about
// 2 s before reporting it, so a connect may take longer there.
const REFUSED = new Set(['ECONNREFUSED', 'ECONNRESET', 'EHOSTUNREACH'])
const LISTENER_CHECK_TIMEOUT_MS = process.platform === 'win32' ? 3000 : 1000
let refusedInARow = 0
let checking = false
const checkable = Number.isInteger(port) && port > 0 && port < 65536
setInterval(() => {
  if (checking || !checkable) return
  checking = true
  const socket = net.connect({ host, port })
  // The check never keeps this process alive, and never delays the idle check of a handler.
  socket.unref()
  let settled = false
  const settle = (refused) => {
    if (settled) return
    settled = true
    checking = false
    socket.destroy()
    refusedInARow = refused ? refusedInARow + 1 : 0
    if (refusedInARow >= 2) leave()
  }
  socket.setTimeout(LISTENER_CHECK_TIMEOUT_MS, () => settle(false))
  socket.once('connect', () => settle(false))
  socket.on('error', (error) => settle(REFUSED.has(error.code)))
}, 2000).unref()

const isGone = (error) =>
  GONE.has(error?.code) || error?.message === 'socket hang up'

// What the caller receives never shows this machine's paths: the code root reads as /var/task and
// this client reads as Lambda's runtime entry, each keeping the file:// scheme where it had one
// (ES module frames have it, as they do in Lambda). A path matches only where a path starts (line
// start, whitespace, a quote or a parenthesis) and as whole segments, so /work/app leaves both
// /backup/work/app and /work/application alone. Node reports module paths with symbolic links
// resolved, so each root is matched as given and as its real path.
const SELF = [import.meta.url, fileURLToPath(import.meta.url)]
const escaped = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const pathPattern = (text) =>
  new RegExp(`(?<=^|[\\s('"\`])${escaped(text)}(?=[\\\\/:)'"\`\\s]|$)`, 'gm')
const realpath = (dir) => {
  try {
    return fs.realpathSync(dir)
  } catch {
    return dir
  }
}
const ownPaths = [
  [pathPattern(import.meta.url), 'file:///var/runtime/index.mjs'],
  [pathPattern(fileURLToPath(import.meta.url)), '/var/runtime/index.mjs'],
]
const roots = [
  ...new Set(
    [config.taskRoot, config.serviceDir]
      .filter(Boolean)
      .flatMap((root) => [root, realpath(root)]),
  ),
]
  .sort((a, b) => b.length - a.length)
  .flatMap((root) => [
    [pathPattern(pathToFileURL(root).href), 'file:///var/task'],
    [pathPattern(root), '/var/task'],
  ])
const asLambdaPath = (text) => {
  let shown = String(text)
  for (const [own, lambdaPath] of ownPaths) {
    shown = shown.replace(own, lambdaPath)
  }
  for (const [root, lambdaPath] of roots) {
    shown = shown.replace(root, lambdaPath)
  }
  return shown.replace(/\/var\/task\\[^\s:)'"`]*/g, (match) =>
    match.replace(/\\/g, '/'),
  )
}

// This client's own frames are not the handler's: they never reach the caller.
const ownFrame = (line) =>
  /^\s+at /.test(line) && SELF.some((self) => line.includes(self))

const traceOf = (stack) =>
  String(stack ?? '')
    .split(/\r?\n/)
    .filter((line) => line && !ownFrame(line))
    .map(asLambdaPath)

const errorBody = (error) => {
  if (
    error instanceof Error ||
    (error && typeof error === 'object' && 'message' in error)
  ) {
    return {
      errorType: error.name || 'Error',
      errorMessage: asLambdaPath(error.message ?? ''),
      trace: traceOf(error.stack),
    }
  }
  return {
    errorType: typeof error,
    errorMessage: asLambdaPath(error),
    trace: [],
  }
}

/**
 * An invocation's error as Lambda's runtime posts it: the error body, then the invocation's request
 * id (an init error has none).
 */
const invocationErrorBody = (error, requestId) => ({
  ...errorBody(error),
  requestId,
})

/** An init error of the runtime's own type, keeping the frames of the error that caused it. */
const named = (errorType, message, cause) => {
  const error = new Error(message)
  error.name = errorType
  const frames = String(cause?.stack ?? '')
    .split(/\r?\n/)
    .filter((line) => /^\s+at /.test(line))
  error.stack = [`${errorType}: ${message}`, ...frames].join('\n')
  return error
}

// Logged values are formatted in full, objects at any depth; colours only when the CLI's own
// output has them, and never on stderr.
const formatted = (write, colors) => {
  const options = { colors, depth: null }
  return (...args) => write('%s', formatWithOptions(options, ...args))
}
const colors = Boolean(config.colors)
console.log = formatted(console.log.bind(console), colors)
console.info = formatted(console.info.bind(console), colors)
console.debug = formatted(console.debug.bind(console), colors)
console.warn = formatted(console.warn.bind(console), false)
console.error = formatted(console.error.bind(console), false)

const request = (method, pathname, { headers = {}, body } = {}) =>
  new Promise((resolve, reject) => {
    const req = http.request(
      { host, port, method, path: `${API}${pathname}`, headers, agent },
      (res) => {
        const chunks = []
        res.on('data', (chunk) => chunks.push(chunk))
        res.on('end', () =>
          resolve({
            status: res.statusCode,
            headers: res.headers,
            body: Buffer.concat(chunks),
          }),
        )
        res.on('error', reject)
      },
    )
    req.on('error', reject)
    req.end(body)
  })
const postError = (pathname, body) =>
  request('POST', pathname, {
    headers: {
      'Content-Type': 'application/json',
      'Lambda-Runtime-Function-Error-Type': body.errorType,
    },
    body: JSON.stringify(body),
  })

const BEFORE_FIRST_WRITE = Symbol('beforeFirstWrite')

class HttpResponseStream {
  static from(underlyingStream, prelude) {
    underlyingStream.setContentType(PRELUDE_CONTENT_TYPE)
    const metadata = JSON.stringify(prelude)
    underlyingStream[BEFORE_FIRST_WRITE] = (write) => {
      write(metadata)
      write(new Uint8Array(8))
    }
    return underlyingStream
  }
}
const noGlobal = ['1', 'true'].includes(
  String(process.env.AWS_LAMBDA_NODEJS_NO_GLOBAL_AWSLAMBDA ?? '').toLowerCase(),
)
if (!noGlobal) {
  globalThis.awslambda = {
    streamifyResponse(handler) {
      handler[STREAMING] = 'response'
      return handler
    },
    HttpResponseStream,
  }
}

const exportOf = (module) =>
  String(config.exportPath ?? 'handler')
    .split('.')
    .reduce(
      (value, key) =>
        value === undefined || value === null ? undefined : value[key],
      module,
    )

const loadHandler = async () => {
  // Lambda refuses a handler without a dot before it loads anything.
  if (config.exportPath === null) {
    throw named('Runtime.MalformedHandlerName', 'Bad handler')
  }
  let module
  try {
    module = await import(pathToFileURL(config.handlerFile).href)
  } catch (error) {
    if (
      error?.code === 'ERR_MODULE_NOT_FOUND' ||
      error?.code === 'MODULE_NOT_FOUND'
    ) {
      throw named('Runtime.ImportModuleError', `Error: ${error.message}`, error)
    }
    if (error instanceof SyntaxError) {
      const syntax = named(
        'Runtime.UserCodeSyntaxError',
        `${error.name}: ${error.message}`,
      )
      // Lambda keeps the SyntaxError's own stack as the trace.
      syntax.stack = error.stack
      throw syntax
    }
    throw error
  }
  const handler = exportOf(module) ?? exportOf(module.default)
  if (handler === undefined || handler === null) {
    throw named(
      'Runtime.HandlerNotFound',
      `${handlerString()} is undefined or not exported`,
    )
  }
  if (typeof handler !== 'function') {
    throw named(
      'Runtime.HandlerNotFound',
      `${handlerString()} is not a function`,
    )
  }
  return handler
}

/** The handler as Lambda names it: the module path from the code root, without extension. */
const handlerString = () => {
  const file = String(config.handlerFile)
  const relative = path.relative(String(config.taskRoot ?? ''), file)
  const shown =
    relative && !relative.startsWith('..') && !path.isAbsolute(relative)
      ? relative
      : path.basename(file)
  const module = shown.slice(0, shown.length - path.extname(shown).length)
  return `${module.split(path.sep).join('/')}.${config.exportPath ?? 'handler'}`
}

const parseHeader = (value) => {
  if (!value) return undefined
  for (const text of [value, Buffer.from(value, 'base64').toString('utf8')]) {
    try {
      return JSON.parse(text)
    } catch {
      // Not this encoding.
    }
  }
  return undefined
}

const contextFor = (headers) => {
  const deadline = Number(headers['lambda-runtime-deadline-ms'])
  const context = {
    callbackWaitsForEmptyEventLoop: true,
    functionName: process.env.AWS_LAMBDA_FUNCTION_NAME,
    functionVersion: process.env.AWS_LAMBDA_FUNCTION_VERSION,
    memoryLimitInMB: process.env.AWS_LAMBDA_FUNCTION_MEMORY_SIZE,
    logGroupName: process.env.AWS_LAMBDA_LOG_GROUP_NAME,
    logStreamName: process.env.AWS_LAMBDA_LOG_STREAM_NAME,
    invokedFunctionArn: headers['lambda-runtime-invoked-function-arn'],
    awsRequestId: headers['lambda-runtime-aws-request-id'],
    getRemainingTimeInMillis: () => deadline - Date.now(),
  }
  const identity = parseHeader(headers['lambda-runtime-cognito-identity'])
  if (identity) context.identity = identity
  const clientContext = parseHeader(headers['lambda-runtime-client-context'])
  if (clientContext) context.clientContext = clientContext
  if (headers['lambda-runtime-aws-tenant-id']) {
    context.tenantId = headers['lambda-runtime-aws-tenant-id']
  }
  return context
}

const nodeJsExit = () =>
  named(
    'Runtime.NodeJsExit',
    'The Lambda runtime client detected an unexpected Node.js exit code. This is most commonly caused by a Promise that was never settled. For more information, see https://nodejs.org/docs/latest/api/process.html#exit-codes',
  )

/**
 * Settles with the invocation's outcome, or the way Lambda does when the handler leaves nothing
 * to wait for: once the event loop is empty, a callback-style handler that never called back
 * answers null, and a handler whose promise never settled fails with Runtime.NodeJsExit. Either
 * way the process goes on to the next invocation. `whenIdle(settle)` holds an outcome until the
 * event loop is empty (a callback with `callbackWaitsForEmptyEventLoop` left true).
 */
const settleWhenIdle = (run) =>
  new Promise((resolve, reject) => {
    let returnedPromise = false
    let held = null
    const idle = () => {
      if (held) return held()
      return returnedPromise ? reject(nodeJsExit()) : resolve(null)
    }
    process.once('beforeExit', idle)
    const settled = (settle) => (value) => {
      process.removeListener('beforeExit', idle)
      settle(value)
    }
    run({
      resolve: settled(resolve),
      reject: settled(reject),
      whenIdle: (settle) => {
        held ??= settle
      },
      returned: (value) => {
        if (value && typeof value.then === 'function') {
          returnedPromise = true
          value.then(settled(resolve), settled(reject))
          return true
        }
        return false
      },
    })
  })

const runBuffered = (handler, event, context) =>
  settleWhenIdle(({ resolve, reject, returned, whenIdle }) => {
    if (passesCallback) {
      // As in Lambda's Node.js runtime: an error answers at once; a result waits until the event
      // loop is empty while `callbackWaitsForEmptyEventLoop` is true (the default; the deadline still
      // bounds it), and answers at once when it is false. context.done, succeed and fail answer at
      // once, as there. Any error but null or undefined is one, as there (0, '' and false too).
      const failed = (error) => error !== null && error !== undefined
      const finish = (error, value) =>
        failed(error) ? reject(error) : resolve(value)
      const callback = (error, value) => {
        if (failed(error) || context.callbackWaitsForEmptyEventLoop === false) {
          finish(error, value)
        } else {
          whenIdle(() => finish(error, value))
        }
      }
      context.done = finish
      context.succeed = (value) => finish(null, value)
      context.fail = (error) => finish(error ?? new Error('handled'))
      try {
        returned(handler(event, context, callback))
      } catch (error) {
        reject(error)
      }
      return
    }
    try {
      const value = handler(event, context)
      if (!returned(value)) resolve(value)
    } catch (error) {
      reject(error)
    }
  })

/**
 * Lambda's runtime fails a streaming handler that returns no promise; before Node.js 24 it reports
 * the message as a string, from Node.js 24 on as an Error.
 */
const NON_ASYNC_STREAMING = 'Streaming does not support non-async handlers.'
const nonAsyncStreaming = () =>
  passesCallback ? NON_ASYNC_STREAMING : new Error(NON_ASYNC_STREAMING)

const runStreaming = (handler, event, stream, context) =>
  settleWhenIdle(({ resolve, reject, returned }) => {
    try {
      const value = handler(event, stream, context)
      if (!returned(value)) reject(nonAsyncStreaming())
    } catch (error) {
      reject(error)
    }
  })

/**
 * The response stream a streaming handler writes to: a chunked POST to /response that starts with
 * the handler's first write (or its end), so the content type can change until then. A failure
 * ends the stream with Lambda's error trailers, after every write the handler already made.
 */
const openStream = (requestId) => {
  let req = null
  let response = null
  let contentType = 'application/octet-stream'
  let wrote = false
  let failure = null
  const start = () => {
    if (req) return
    req = http.request({
      host,
      port,
      method: 'POST',
      agent,
      path: `${API}/invocation/${requestId}/response`,
      headers: {
        'Content-Type': contentType,
        'Lambda-Runtime-Function-Response-Mode': 'streaming',
        'Transfer-Encoding': 'chunked',
        Trailer:
          'Lambda-Runtime-Function-Error-Type, Lambda-Runtime-Function-Error-Body',
      },
    })
    response = new Promise((resolve, reject) => {
      req.on('response', (res) => {
        res.resume()
        res.on('end', resolve)
      })
      req.on('error', reject)
    })
    // Awaited by finish() or fail(); until then a lost connection must not count as unhandled.
    response.catch(() => {})
  }
  const beforeFirstWrite = () => {
    if (wrote) return
    wrote = true
    stream[BEFORE_FIRST_WRITE]?.((part) => req.write(part))
  }
  const endRequest = () => {
    if (req.writableEnded) return
    if (failure) {
      req.addTrailers({
        'Lambda-Runtime-Function-Error-Type': failure.errorType,
        'Lambda-Runtime-Function-Error-Body': Buffer.from(
          JSON.stringify(failure),
        ).toString('base64'),
      })
    }
    req.end()
  }
  const stream = new Writable({
    write(chunk, encoding, callback) {
      start()
      beforeFirstWrite()
      req.write(chunk, callback)
    },
    final(callback) {
      start()
      // The prelude goes out only with the handler's response: a failure before any write has none.
      if (!failure) beforeFirstWrite()
      endRequest()
      callback()
    },
  })
  // A stream error reaches the caller through the handler's rejection or finish(), not as a crash.
  stream.on('error', () => {})
  stream.setContentType = (type) => {
    if (req) throw new Error('Cannot set content-type, too late.')
    contentType = type
  }
  const ended = () =>
    new Promise((resolve, reject) => {
      if (stream.writableFinished) return resolve()
      if (stream.destroyed) return reject(stream.errored ?? new Error('ended'))
      stream.end((error) => (error ? reject(error) : resolve()))
    })
  return {
    stream,
    async finish() {
      await ended()
      await response
    },
    async fail(body) {
      // The handler ended its stream, then failed: the caller already has the whole response and
      // no trailer can follow it. Lambda's runtime logs the error then, and so does this one.
      if (req?.writableEnded) {
        console.error(
          'Invoke Error',
          JSON.stringify({
            errorType: body.errorType,
            errorMessage: body.errorMessage,
            stack: body.trace,
          }),
        )
        await response
        return
      }
      failure = body
      // Ending the stream flushes the writes it still holds before the trailers go out.
      await ended().catch(() => {})
      start()
      endRequest()
      await response
    },
  }
}

let initialized = false
let current = null
let currentStream = null

// Like Lambda: an uncaught exception (exit 129) or an unhandled rejection (exit 128) fails the
// invocation in flight (or the init) and ends the execution environment.
const crash = (bodyOf, exitCode) => async (reason) => {
  const body = bodyOf(reason)
  console.error(reason)
  const report = currentStream
    ? currentStream.fail(body)
    : current
      ? postError(`/invocation/${current}/error`, {
          ...body,
          requestId: current,
        })
      : !initialized
        ? postError('/init/error', body)
        : null
  // The report is best effort: the process ends either way, and soon.
  if (report) {
    await new Promise((resolve) => {
      setTimeout(resolve, 2_000).unref()
      report.then(resolve, resolve)
    })
  }
  process.exit(exitCode)
}
process.on('uncaughtException', crash(errorBody, 129))
// Lambda's message is the reason as a string ("Error: boom"); the frames are the reason's own.
process.on(
  'unhandledRejection',
  crash(
    (reason) => ({
      errorType: 'Runtime.UnhandledPromiseRejection',
      errorMessage: asLambdaPath(reason),
      trace: reason instanceof Error ? traceOf(reason.stack) : [],
    }),
    128,
  ),
)

const main = async () => {
  let handler
  try {
    handler = await loadHandler()
  } catch (error) {
    await postError('/init/error', errorBody(error))
    process.exit(1)
  }
  initialized = true
  const streaming = handler[STREAMING] === 'response'
  for (;;) {
    const next = await request('GET', '/invocation/next')
    if (next.status !== 200) process.exit(1)
    const headers = next.headers
    const requestId = headers['lambda-runtime-aws-request-id']
    if (headers['lambda-runtime-trace-id']) {
      process.env._X_AMZN_TRACE_ID = headers['lambda-runtime-trace-id']
    } else {
      delete process.env._X_AMZN_TRACE_ID
    }
    // As in Lambda's runtime, the body is parsed as JSON before the handler is entered: a body that
    // is empty or not JSON fails the invocation with the parse error.
    let event
    let unparsed = null
    try {
      event = JSON.parse(next.body.toString('utf8'))
    } catch (error) {
      unparsed = error
    }
    const context = contextFor(headers)
    current = requestId
    if (streaming) {
      const handle = openStream(requestId)
      currentStream = handle
      try {
        if (unparsed) throw unparsed
        await runStreaming(handler, event, handle.stream, context)
        await handle.finish()
      } catch (error) {
        await handle.fail(errorBody(error))
      }
      currentStream = null
    } else {
      let payload
      try {
        if (unparsed) throw unparsed
        const result = await runBuffered(handler, event, context)
        try {
          payload = JSON.stringify(result === undefined ? null : result)
        } catch (cause) {
          throw named(
            'Runtime.JSONStringifyError',
            'Unable to stringify response body',
            cause,
          )
        }
      } catch (error) {
        await postError(
          `/invocation/${requestId}/error`,
          invocationErrorBody(error, requestId),
        )
        current = null
        continue
      }
      await request('POST', `/invocation/${requestId}/response`, {
        headers: { 'Content-Type': 'application/json' },
        body: payload,
      })
    }
    current = null
  }
}

main().catch((error) => {
  if (isGone(error)) leave()
  console.error(error)
  process.exit(1)
})
