/**
 * The invocation stream on the terminal. Each invocation has a start line and an end line that
 * share the first 8 characters of its request id; the handler's log lines between them carry a
 * bar in the invocation's colour. Without colour (NO_COLOR, pipes, AI agents), and while
 * invocations overlap, every log line starts with the id instead, so colour is never the only
 * link. Errors are on the end line, with the first frames of the developer's own code and what the
 * caller received. Colours come from the CLI logger (`style`, `stringToSafeColor`), so its colour
 * rule applies to them. Everything taken from an event or an error is made printable first:
 * events are remote-controlled.
 */
import util from 'util'
import stringWidth from 'string-width'
// Subpath import: tests that load every plugin mock '@serverless/util' wholesale.
import { stringToSafeColor, style } from '@serverless/util/src/logger/index.js'
import {
  clean,
  describeMcpRequest,
  describeMcpResponse,
  formatDuration,
  printable,
} from '../mcp-log.js'
import { shouldWarnEdgeFirstByteBudget } from '../../mcp/lib/endpoint-type.js'
import { redactEvent, redactResponse } from '../state/redact.js'

export const PRELUDE_CONTENT_TYPE =
  'application/vnd.awslambda.http-integration-response'
export const PRELUDE_DELIMITER = Buffer.alloc(8)

/**
 * Whether the CLI shows colour: the logger's colour level, which its colour rule (NO_COLOR,
 * FORCE_COLOR, AI agents) and a piped stream set.
 */
export const colorsShown = () => style.bold.level > 0

export const shortId = (requestId) => String(requestId ?? '').slice(0, 8)

// A line break inside a value would leave the rest of it on a line of its own.
const oneLine = (value) =>
  value === undefined || value === null
    ? ''
    : String(value).replace(/\r?\n/g, ' ')
/** A short field (a label part, an error type), capped like every MCP field. */
const show = (value, fallback = '?') => printable(oneLine(value)) ?? fallback
/** An error message in full: its action and resource are often past any cap. */
const showMessage = (value) => clean(oneLine(value)).trim()
const lastOf = (value, separator) =>
  String(value ?? '')
    .split(separator)
    .pop()
const recordsOf = (event) =>
  Array.isArray(event?.Records) ? event.Records : null
const sourceOf = (record) => record?.eventSource ?? record?.EventSource
const count = (n, one, many) => ` · ${n} ${n === 1 ? one : many}`
const json = (value) => {
  try {
    return JSON.parse(
      Buffer.isBuffer(value) ? value.toString('utf8') : String(value ?? ''),
    )
  } catch {
    return undefined
  }
}

export const eventLabel = (event, { mcp = false } = {}) => {
  if (!event || typeof event !== 'object' || Array.isArray(event)) {
    return 'direct invoke'
  }
  if (mcp) {
    const call = describeMcpRequest(event)
    if (call) return `mcp ${call}`
  }
  if (isLoadBalancer(event) && event.httpMethod) {
    return `aws:alb:${show(event.httpMethod).toLowerCase()}:${show(event.path, '/')}`
  }
  // An HTTP API's payload format 1.0 has a REST API's shape plus `version: '1.0'`.
  if (isHttpApi(event) && event.httpMethod) {
    return `aws:apigateway:v2:${show(event.httpMethod).toLowerCase()}:${show(event.path, '/')}`
  }
  if (event.requestContext && event.httpMethod) {
    return `aws:apigateway:v1:${show(event.httpMethod).toLowerCase()}:${show(event.path, '/')}`
  }
  if (event.requestContext?.http) {
    const kind = String(event.requestContext.domainName ?? '').includes(
      '.lambda-url.',
    )
      ? 'aws:lambda-url'
      : 'aws:apigateway:v2'
    return `${kind}:${show(event.requestContext.http.method).toLowerCase()}:${show(event.requestContext.http.path, '/')}`
  }
  if (
    event.source === 'aws.events' &&
    event['detail-type'] === 'Scheduled Event'
  ) {
    return `aws:schedule:${show(lastOf(event.resources?.[0], '/'), 'rule')}`
  }
  if (event['detail-type'] !== undefined) {
    return `aws:eventbridge:${show(event.source)}:${show(event['detail-type'])}`
  }
  const records = recordsOf(event)
  if (records?.length) {
    const [first] = records
    const many = records.length > 1
    switch (sourceOf(first)) {
      case 'aws:sqs':
        return many
          ? `aws:sqs:${show(lastOf(first.eventSourceARN, ':'))}${count(records.length, 'message', 'messages')}`
          : `aws:sqs:${show(lastOf(first.eventSourceARN, ':'))}:${show(first.messageId)}`
      case 'aws:sns':
        return many
          ? `aws:sns:${show(lastOf(first.Sns?.TopicArn, ':'))}${count(records.length, 'message', 'messages')}`
          : `aws:sns:${show(lastOf(first.Sns?.TopicArn, ':'))}:${show(first.Sns?.Subject || first.Sns?.MessageId)}`
      case 'aws:s3':
        return `aws:s3:${show(first.s3?.bucket?.name)}:${show(first.eventName)}${many ? count(records.length, 'record', 'records') : ''}`
      case 'aws:dynamodb':
        return `aws:dynamodb:${show(String(first.eventSourceARN ?? '').split('/')[1], 'table')}${count(records.length, 'record', 'records')}`
      case 'aws:kinesis':
        return `aws:kinesis:${show(String(first.eventSourceARN ?? '').split('/')[1], 'stream')}${count(records.length, 'record', 'records')}`
      default:
        break
    }
  }
  return 'direct invoke'
}

// A name CloudFormation generates: `<stack>-<logical id>-<suffix>`, the logical id letters and
// digits, the suffix 12 or 13 random letters and digits with at least one capital and one digit. A
// lowercase suffix, a number (an account id, a timestamp) or a word without digits may be a name
// someone chose, so the name keeps it.
const GENERATED_NAME =
  /^([A-Za-z0-9]+)-(?=[A-Za-z0-9]*[A-Z])(?=[A-Za-z0-9]*[0-9])[A-Za-z0-9]{12,13}$/
const FIFO = '.fifo'

/**
 * A resource name as a person reads it: `orders-dev-JobsQueue-i0PzaO617EMJ` is `JobsQueue`.
 * Only a name that starts with one of `prefixes` (the stack name, `<service>-<stage>-`) loses
 * them, and then the suffix CloudFormation adds to the names it generates (a FIFO queue keeps
 * `.fifo`); any other name is shown as it is.
 */
export const resourceShortName = (name, prefixes = []) => {
  const text = String(name ?? '')
  const prefix = prefixes.find(
    (candidate) =>
      candidate &&
      text.length > candidate.length &&
      text.toLowerCase().startsWith(candidate.toLowerCase()),
  )
  if (!prefix) return text
  const rest = text.slice(prefix.length)
  const fifo = rest.endsWith(FIFO) ? FIFO : ''
  const generated = GENERATED_NAME.exec(
    rest.slice(0, rest.length - fifo.length),
  )
  return generated ? `${generated[1]}${fifo}` : rest
}

/**
 * The event as the invocation stream names it for a person: `POST /jobs`, `SQS JobsQueue`,
 * `S3 uploads ObjectCreated:Put`, `mcp tools/call add`. Records, invocation files and `--json`
 * keep `eventLabel`, and detailed output shows it too.
 */
export const shortLabel = (event, { mcp = false, prefixes = [] } = {}) => {
  if (!event || typeof event !== 'object' || Array.isArray(event)) {
    return 'direct invoke'
  }
  if (mcp) {
    const call = describeMcpRequest(event)
    if (call) return `mcp ${call}`
  }
  const short = (name, fallback) =>
    show(resourceShortName(name, prefixes), fallback)
  const route = (method, routePath) =>
    `${show(method).toUpperCase()} ${show(routePath, '/')}`
  if (event.requestContext && event.httpMethod) {
    return route(event.httpMethod, event.path)
  }
  if (event.requestContext?.http) {
    return route(
      event.requestContext.http.method,
      event.requestContext.http.path,
    )
  }
  if (
    event.source === 'aws.events' &&
    event['detail-type'] === 'Scheduled Event'
  ) {
    return `schedule ${short(lastOf(event.resources?.[0], '/'), 'rule')}`
  }
  if (event['detail-type'] !== undefined) {
    return `EventBridge ${show(event['detail-type'])}`
  }
  const records = recordsOf(event)
  if (records?.length) {
    const [first] = records
    const n = records.length
    const more = (one, many) => (n > 1 ? count(n, one, many) : '')
    switch (sourceOf(first)) {
      case 'aws:sqs':
        return `SQS ${short(lastOf(first.eventSourceARN, ':'))}${more('message', 'messages')}`
      case 'aws:sns':
        return `SNS ${short(lastOf(first.Sns?.TopicArn, ':'))}${more('message', 'messages')}`
      case 'aws:s3':
        return `S3 ${short(first.s3?.bucket?.name)} ${show(first.eventName)}${more('record', 'records')}`
      case 'aws:dynamodb':
        return `DynamoDB ${short(String(first.eventSourceARN ?? '').split('/')[1], 'table')}${more('record', 'records')}`
      case 'aws:kinesis':
        return `Kinesis ${short(String(first.eventSourceARN ?? '').split('/')[1], 'stream')}${more('record', 'records')}`
      default:
        break
    }
  }
  return 'direct invoke'
}

const graphemes = new Intl.Segmenter()
/**
 * `text` cut to `max` terminal columns, the last one an ellipsis. A wide character (CJK, most
 * emoji) takes two columns, and a character made of several code points is never split.
 */
const cut = (text, max) => {
  if (stringWidth(text) <= max) return text
  if (max < 1) return ''
  let kept = ''
  let used = 0
  for (const { segment } of graphemes.segment(text)) {
    used += stringWidth(segment)
    if (used > max - 1) break
    kept += segment
  }
  return `${kept}…`
}

const errorOf = (body, errorType) => {
  const parsed = json(body) ?? {}
  return {
    type: String(parsed.errorType ?? errorType ?? 'Error'),
    message: String(parsed.errorMessage ?? ''),
    trace: Array.isArray(parsed.trace)
      ? parsed.trace
      : Array.isArray(parsed.stackTrace)
        ? parsed.stackTrace
        : [],
  }
}

/**
 * A stream's kept bytes as its caller receives them: `prelude`, the metadata of the HTTP prelude it
 * opened with (status, headers, cookies), and `body`, what follows it. Without the prelude content
 * type, or without a whole prelude in `head`, there is no `prelude` and everything is body.
 */
export const splitPrelude = ({ contentType, head }) => {
  const bytes = head ?? Buffer.alloc(0)
  if (contentType === PRELUDE_CONTENT_TYPE) {
    const delimiter = bytes.indexOf(PRELUDE_DELIMITER)
    const prelude =
      delimiter === -1 ? undefined : json(bytes.subarray(0, delimiter))
    if (prelude && typeof prelude === 'object') {
      return {
        prelude,
        body: bytes.subarray(delimiter + PRELUDE_DELIMITER.length),
      }
    }
  }
  return { prelude: undefined, body: bytes }
}

export const preludeStatusCode = ({ contentType, head }) => {
  const code = splitPrelude({ contentType, head }).prelude?.statusCode
  return typeof code === 'number' ? code : undefined
}

/** A reply's payload as the end line reads it: parsed JSON, else its text. */
const payloadOf = (bytes) => {
  const parsed = json(bytes)
  return parsed === undefined ? bytes.toString('utf8') : parsed
}

/**
 * A streamed reply read as a buffered one: its prelude with the body as text (a stream without a
 * prelude is its payload). Undefined when the stream went past the head the invocation kept
 * (`bodyHead`): a reply cut short cannot be read.
 */
const streamedReplyOf = ({ contentType, bodyHead, bodyBytes }) => {
  if (!bodyHead || (bodyBytes ?? bodyHead.length) > bodyHead.length) {
    return undefined
  }
  const { prelude, body } = splitPrelude({ contentType, head: bodyHead })
  return prelude ? { ...prelude, body: body.toString('utf8') } : payloadOf(body)
}

/**
 * A reply as `describeMcpResponse` reads it, an HTTP response with a text body: a payload without
 * that shape (a stream without a prelude) becomes the body.
 */
const asHttpReply = (replied) =>
  typeof replied?.body === 'string'
    ? replied
    : {
        body: typeof replied === 'string' ? replied : JSON.stringify(replied),
      }

/**
 * Counts the chunks of a stream's body, the part its caller receives as the response. A stream
 * opened with Lambda's HTTP integration prelude starts with writes of its own (its metadata, then
 * 8 NUL bytes) that are not body: they never count, and a chunk that ends the prelude counts only
 * when body bytes follow in it. Past `limit` bytes without the delimiter there is no prelude, and
 * everything is body. Empty chunks never count.
 */
export const createBodyChunkCounter = ({ contentType, limit = 16_384 }) => {
  let inPrelude = contentType === PRELUDE_CONTENT_TYPE
  let prelude = Buffer.alloc(0)
  // The chunks held while the delimiter has not come yet.
  let held = 0
  let count = 0
  return {
    add(chunk) {
      if (!chunk?.length) return
      if (!inPrelude) {
        count += 1
        return
      }
      prelude = Buffer.concat([prelude, chunk])
      held += 1
      const delimiter = prelude.indexOf(PRELUDE_DELIMITER)
      if (delimiter !== -1) {
        inPrelude = false
        if (prelude.length > delimiter + PRELUDE_DELIMITER.length) count += 1
        prelude = Buffer.alloc(0)
      } else if (prelude.length > limit) {
        inPrelude = false
        count += held
        prelude = Buffer.alloc(0)
      }
    },
    get count() {
      return count
    },
  }
}

const toneOf = (statusCode) =>
  statusCode >= 500 ? 'error' : statusCode >= 400 ? 'partial' : 'ok'

export const outcomeOf = ({ reply, trailers, head, contentType, event }) => {
  if (reply.kind === 'error' || reply.kind === 'init_error') {
    return { tone: 'error', error: errorOf(reply.body, reply.errorType) }
  }
  if (reply.kind === 'stream') {
    if (trailers?.aborted) {
      return {
        tone: 'error',
        error: {
          type: String(trailers.errorType ?? 'Runtime.Unknown'),
          message: 'the response stream ended before the handler finished it',
          trace: [],
        },
      }
    }
    if (trailers?.errorType) {
      const body = trailers.errorBody
        ? Buffer.from(trailers.errorBody, 'base64')
        : ''
      return { tone: 'error', error: errorOf(body, trailers.errorType) }
    }
    const statusCode = preludeStatusCode({
      contentType: contentType ?? reply.contentType,
      head,
    })
    return statusCode === undefined
      ? { tone: 'ok', text: '(ok)' }
      : { tone: toneOf(statusCode), text: `(${statusCode})` }
  }
  const body = json(reply.body)
  if (body && typeof body === 'object') {
    const failures = Array.isArray(body.batchItemFailures)
      ? body.batchItemFailures.length
      : 0
    if (failures > 0) {
      const total = recordsOf(event)?.length ?? failures
      return {
        tone: 'partial',
        text: `(partial) ${Math.max(total - failures, 0)}/${total} ok, ${failures} returned as batchItemFailures`,
      }
    }
    if (typeof body.statusCode === 'number') {
      return { tone: toneOf(body.statusCode), text: `(${body.statusCode})` }
    }
  }
  return { tone: 'ok', text: '(ok)' }
}

// Frames arrive with the function's code root as /var/task (both runtime clients rewrite it); a
// Node.js ES module frame may still carry its file:// scheme in front. A path may contain spaces.
const NODE_FRAME = /\/var\/task\/([^():]+?):(\d+):(\d+)/
// A Python syntax error's place reads File "…" Line N in Lambda's runtime.
const PYTHON_FRAME =
  /File "\/var\/task\/([^"]+)"(?:,? [Ll]ine (\d+))?(?:, in ([^\s,]+))?/
// Installed packages are not the developer's code, even inside the code root: a service-local
// virtualenv, site-packages and dist-packages, node_modules, and the MCP entry the Framework adds.
const NOT_YOURS = new Set([
  'node_modules',
  '.venv',
  'venv',
  'site-packages',
  'dist-packages',
  'serverless-mcp',
])

const isYours = (relative) =>
  !relative.split('/').some((segment) => NOT_YOURS.has(segment))

/**
 * The first frames in the function's own code, relative to it: `src/orders/list.ts:27:18` for
 * Node.js, `app/handler.py:7 in handler` for Python.
 */
export const userFrames = (trace = [], limit = 3) => {
  const frames = []
  for (const line of Array.isArray(trace) ? trace : []) {
    const text = clean(String(line))
    const node = NODE_FRAME.exec(text)
    const python = node ? null : PYTHON_FRAME.exec(text)
    if (node && isYours(node[1])) {
      frames.push(`${node[1]}:${node[2]}:${node[3]}`)
    } else if (python && isYours(python[1])) {
      const [, file, lineNumber, scope] = python
      frames.push(
        `${file}${lineNumber ? `:${lineNumber}` : ''}${scope ? ` in ${scope}` : ''}`,
      )
    }
    if (frames.length >= limit) break
  }
  return frames
}

const isFunctionUrl = (event) =>
  String(event?.requestContext?.domainName ?? '').includes('.lambda-url.')
// An Application Load Balancer event carries `httpMethod` like a REST API's.
const isLoadBalancer = (event) => Boolean(event?.requestContext?.elb)
// An HTTP API sends payload format 2.0 (`requestContext.http`) or 1.0, which has a REST API's
// shape plus `version: '1.0'` (a REST API's event has no version).
const isHttpApi = (event) =>
  Boolean(event?.requestContext?.http) ||
  (event?.version === '1.0' && Boolean(event?.requestContext))
const isRestApi = (event) =>
  Boolean(event?.requestContext && event.httpMethod) &&
  !isLoadBalancer(event) &&
  !isHttpApi(event)

/** What a caller that invokes with a buffered Invoke got from a stream that failed after it started. */
const bufferedInvokeOf = (caller) =>
  `${caller} invokes with a buffered Invoke, which got the chunks sent before the error and no function error`

/**
 * What the invoking service got back for a function error, from the shape of the event. A response
 * stream that had `streamed` (sent its first bytes) before the error already gave its caller a
 * status and those chunks: `statusCode` is the one its HTTP prelude set. API Gateway HTTP APIs and
 * load balancers never stream: they invoke with a buffered Invoke.
 */
export const callerReceived = (
  event,
  { streamed = false, statusCode } = {},
) => {
  if (streamed) {
    const chunks = 'the chunks sent before the error'
    if (isHttpApi(event)) {
      // A function URL answers 200 when the prelude sets no status.
      return isFunctionUrl(event)
        ? `status ${statusCode ?? 200} and ${chunks}, with no error: a function URL reports none once the response has started`
        : bufferedInvokeOf('API Gateway HTTP API')
    }
    if (isLoadBalancer(event)) {
      return bufferedInvokeOf('an Application Load Balancer')
    }
    if (isRestApi(event)) {
      // AWS documents no default status for a REST API stream whose prelude sets none. The error
      // then cuts the client's connection before the response ends.
      const status =
        statusCode === undefined ? chunks : `status ${statusCode} and ${chunks}`
      return `${status}, then the connection is cut before the response ends, when the integration streams (API Gateway REST API)`
    }
    return "the chunks sent before the error, then the error in the stream's last event (InvokeWithResponseStream); a buffered Invoke gets the chunks and no error"
  }
  if (event && typeof event === 'object') {
    if (isLoadBalancer(event)) {
      return '502 Bad Gateway (Application Load Balancer)'
    }
    if (isRestApi(event)) {
      return '502 Internal server error (API Gateway REST API)'
    }
    if (isHttpApi(event)) {
      return isFunctionUrl(event)
        ? '502 Internal Server Error (function URL)'
        : '500 Internal Server Error (API Gateway HTTP API)'
    }
    const records = recordsOf(event)
    const source = sourceOf(records?.[0])
    if (source === 'aws:sqs') {
      return records.length === 1
        ? 'the message goes back to the queue and is retried when it becomes visible again'
        : `the ${records.length} messages go back to the queue and are retried when they become visible again`
    }
    if (source === 'aws:dynamodb' || source === 'aws:kinesis') {
      return 'Lambda retries the batch from the stream'
    }
    if (
      source === 'aws:sns' ||
      source === 'aws:s3' ||
      event['detail-type'] !== undefined
    ) {
      return 'Lambda retries the asynchronous event (up to 2 more times by default)'
    }
  }
  // Nothing in an invocation tells a synchronous invoke from an asynchronous one.
  return 'the function error (X-Amz-Function-Error: Unhandled); an asynchronous invocation is retried instead (up to 2 more times by default)'
}

/**
 * The HTTP status a function error gave an API Gateway, load balancer or function URL caller (see
 * `callerReceived`, which says the same in words); undefined for every other caller. A stream that
 * had started gave its caller the status its prelude set (a function URL: 200 without one).
 */
export const errorStatusCode = (
  event,
  { streamed = false, statusCode } = {},
) => {
  if (!event || typeof event !== 'object') return undefined
  if (streamed) return isFunctionUrl(event) ? (statusCode ?? 200) : statusCode
  if (isLoadBalancer(event) || isRestApi(event)) return 502
  if (isHttpApi(event)) return isFunctionUrl(event) ? 502 : 500
  return undefined
}

/**
 * The deadline counts from when Lambda started the invocation, so the relay to this machine and
 * back counts too: the line names the deadline the caller saw, and the two times this machine
 * measured, the handler process's start-up (`initMs`, when the invocation waited for one) and the
 * handler's own run (`durationMs`). The advice follows whichever of them took most of the timeout.
 */
export const timeoutLine = ({
  functionKey,
  durationMs,
  initMs,
  timeoutSeconds,
}) => {
  const half = (timeoutSeconds * 1000) / 2
  const coldStart =
    initMs === undefined ? '' : `cold start ${formatDuration(initMs)}, `
  const line = `${functionKey} ended after its deployed timeout of ${timeoutSeconds}s (${coldStart}handler ${formatDuration(durationMs)}): the caller got a timeout error.`
  if (durationMs > half && durationMs >= (initMs ?? 0)) {
    return `${line} Speed up the handler, or raise "timeout" in serverless.yml and deploy.`
  }
  if (initMs > half) {
    return `${line} The handler process took ${formatDuration(initMs)} to take the invocation.`
  }
  return line
}

export const workerExitedLine = ({ functionKey, requestId, code, signal }) =>
  `The ${functionKey} handler process exited (${signal ? `signal ${signal}` : `exit code ${code}`}) during ${shortId(requestId)}; the next invocation starts a new one.`

const edgeFirstByteLine = ({ functionKey, ms }) =>
  `${functionKey} sent nothing for ${formatDuration(ms)}. On an edge-optimized endpoint CloudFront drops a response that stays silent for about 29 seconds before it reaches the client: keep tool calls under that budget, or set "provider.endpointType: REGIONAL" when this service owns its REST API.`

/**
 * The `output` the laptop runtime calls (`./runtime.js`). `write` takes the invocation lines,
 * `warn` the warnings about them (both get one line per call, no trailing newline), `blank` the
 * blank line before an invocation that overlaps no other (a section of its own, one blank line
 * whatever came before it). `mcpFunctions` names the functions that are
 * MCP servers; `provider` is the service's provider block, read for the REST API endpoint type.
 * `prefixes` are the name prefixes a resource name in a label loses (`resourceShortName`).
 * `width()` is the terminal's width, which no start or end line goes past unless details are on
 * (0: no limit, as when the output is not a terminal). `colors()` tells whether the CLI shows
 * colour (`colorsShown`). `idle()` is called whenever no invocation is running any more, after
 * the lines of the last one.
 */
export const createInvocationOutput = ({
  write,
  warn = write,
  blank = () => write(''),
  detailed = false,
  mcpFunctions = new Set(),
  provider = {},
  prefixes = [],
  width = () => 0,
  colors = colorsShown,
  idle = () => {},
}) => {
  // The `v` key turns the dumps on and off while the session runs.
  let detailedOn = Boolean(detailed)
  const inFlight = new Set()
  // Called once no invocation is running, after the lines of the last one.
  const settled = () => {
    if (inFlight.size === 0) idle()
  }
  const colorOf = (requestId) => stringToSafeColor(String(requestId ?? ''))
  const bar = (requestId) => {
    const hue = colorOf(requestId)
    if (requestId && (!colors() || inFlight.size > 1)) {
      return hue(`${shortId(requestId)} │`)
    }
    return hue('│')
  }
  const dump = (value) => util.inspect(value, { depth: null, colors: colors() })
  const aside = (parts) => style.aside(parts.join(' · '))

  return {
    start({ functionKey, requestId, event }) {
      // An invocation that overlaps none starts a section of its own.
      if (inFlight.size === 0) blank()
      inFlight.add(requestId)
      const mcp = mcpFunctions.has(functionKey)
      const id = `· ${shortId(requestId)}`
      const head = `→ λ ${functionKey} ── `
      const max = width()
      // A line that wraps breaks the stream's columns: the short label gives way. Detailed output
      // names the event in full, as records and invocation files do.
      const label = detailedOn
        ? eventLabel(event, { mcp })
        : shortLabel(event, { mcp, prefixes })
      const room =
        max > 0 && !detailedOn
          ? max - 1 - stringWidth(head) - 1 - stringWidth(id)
          : Infinity
      write(
        `${colorOf(requestId)('→')} λ ${functionKey} ── ${cut(label, room)} ${style.aside(id)}`,
      )
      if (detailedOn && event !== undefined)
        write(dump(redactEvent(event).value))
    },
    log({ requestId, text }) {
      write(`${bar(requestId)} ${text}`)
      settled()
    },
    end({
      functionKey,
      requestId,
      event,
      reply,
      durationMs,
      initMs,
      deadlineMs,
      endedAt,
      timeoutSeconds,
      trailers,
      chunks,
      firstByteMs,
      head,
      contentType,
      bodyHead,
      bodyBytes,
    }) {
      const outcome = outcomeOf({ reply, trailers, head, contentType, event })
      const mcp = mcpFunctions.has(functionKey)
      // The reply as the JSON-RPC callout and the dump read it: a buffered reply's payload, and an
      // MCP server's streamed reply (MCP replies are small JSON-RPC messages). Other streams are
      // not read.
      const replied =
        reply.kind === 'response'
          ? payloadOf(reply.body)
          : reply.kind === 'stream' && mcp
            ? streamedReplyOf({
                contentType: contentType ?? reply.contentType,
                bodyHead,
                bodyBytes,
              })
            : undefined
      const message = outcome.error ? showMessage(outcome.error.message) : ''
      const details = [formatDuration(durationMs)]
      if (initMs !== undefined) {
        details.push(`cold start ${formatDuration(initMs)}`)
      }
      if (reply.kind === 'stream' && firstByteMs !== undefined) {
        details.push(
          `first byte ${formatDuration(firstByteMs)}, ${chunks} chunk${chunks === 1 ? '' : 's'}`,
        )
      }
      details.push(shortId(requestId))
      const max = width()
      // Like the start line, the end line keeps within the terminal unless details are on: the
      // outcome gives way from its end (an error's message first, then its type), never the
      // durations or the request id. The invocation file keeps the message in full.
      let room =
        max > 0 && !detailedOn
          ? max -
            1 -
            stringWidth(`← λ ${functionKey} `) -
            1 -
            stringWidth(details.join(' · '))
          : Infinity
      const fit = (text) => {
        const kept = cut(text, room)
        room -= stringWidth(kept)
        return kept
      }
      let status
      if (outcome.error) {
        // The error's mark stays even when nothing else fits.
        status = style.error(
          room >= 2
            ? fit(
                `✕ ${show(outcome.error.type, 'Error')}${message ? `: ${message}` : ''}`,
              )
            : '✕',
        )
      } else {
        const text = fit(outcome.text)
        status = outcome.tone === 'ok' ? style.success(text) : text
        const rpcError =
          mcp && replied !== undefined
            ? describeMcpResponse(asHttpReply(replied))
            : null
        if (rpcError && room > 1) {
          room -= 1
          status += ` ${style.error(fit(`── ${rpcError}`))}`
        }
      }
      write(
        [`${colorOf(requestId)('←')} λ ${functionKey}`, status, aside(details)]
          .filter(Boolean)
          .join(' '),
      )
      inFlight.delete(requestId)
      if (outcome.error) {
        for (const frame of userFrames(outcome.error.trace)) {
          write(`  ↳ ${frame}`)
        }
        const streamed =
          reply.kind === 'stream' && firstByteMs !== undefined
            ? {
                streamed: true,
                statusCode: preludeStatusCode({
                  contentType: contentType ?? reply.contentType,
                  head,
                }),
              }
            : undefined
        write(`  Caller received: ${callerReceived(event, streamed)}`)
      }
      if (detailedOn && replied !== undefined) {
        write(dump(redactResponse(replied).value))
      }
      if (timeoutSeconds && deadlineMs !== undefined && endedAt > deadlineMs) {
        warn(timeoutLine({ functionKey, durationMs, initMs, timeoutSeconds }))
      }
      const silentMs = reply.kind === 'stream' ? firstByteMs : durationMs
      if (
        mcp &&
        silentMs !== undefined &&
        shouldWarnEdgeFirstByteBudget({ provider, executionTimeInMs: silentMs })
      ) {
        warn(edgeFirstByteLine({ functionKey, ms: silentMs }))
      }
      settled()
    },
    workerExited(details) {
      warn(workerExitedLine(details))
      settled()
    },
    /** Turns the dumps of events and responses on or off; returns the new state. */
    setDetailed(on) {
      detailedOn = Boolean(on)
      return detailedOn
    },
    isDetailed: () => detailedOn,
  }
}
