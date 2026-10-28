/**
 * `serverless dev requests`: the latest invocations and web app requests Dev Mode ran on this
 * machine, newest first, read from .serverless/dev/invocations and .serverless/dev/requests, so no
 * session is needed. Each one names its file: an invocation's holds the event, the response or
 * error, and the logs; a web request's the request and the response. `--function` lists only
 * invocations of those functions, `--web-app` only requests to those web apps; both list both.
 */
import fs from 'fs'
import stringWidth from 'string-width'
import { ServerlessError } from '@serverless/util'
// Subpath import: tests that load every plugin mock '@serverless/util' wholesale.
import { style } from '@serverless/util/src/logger/index.js'
import { formatAgo } from '../attach/output.js'
import { connectToSession } from '../control/client.js'
import { devDirOf } from '../state/paths.js'
import { listRequests, listWebRequests } from '../state/read.js'
import { envelope, errorResult } from './envelope.js'
import { shownPath } from './cli-names.js'
import { cut } from '../local/invocation-output.js'
import { terminalWidth } from '../local/terminal-width.js'

export const DEFAULT_LIMIT = 20
export const MAX_LIMIT = 500

/** The `--limit` option as a number: a whole number from 1 to MAX_LIMIT, DEFAULT_LIMIT unset. */
export const parseLimit = (value) => {
  if (value === undefined) return DEFAULT_LIMIT
  const text = String(value)
  const limit = /^\d+$/.test(text) ? Number(text) : NaN
  if (!(limit >= 1 && limit <= MAX_LIMIT)) {
    throw new ServerlessError(
      `Option "--limit" takes a whole number from 1 to ${MAX_LIMIT}.`,
      'DEV_MODE_INVALID_LIMIT',
      { stack: false },
    )
  }
  return limit
}

/** The longest route a row shows; the file has the whole path. */
const ROUTE_CHARS = 48
const routeOf = (request) => {
  const route = `${request.method ?? ''} ${request.path ?? ''}`.trim()
  return route.length > ROUTE_CHARS
    ? `${route.slice(0, ROUTE_CHARS - 1)}…`
    : route
}

// The table's columns: the name (a function, or a web app and route) and the file give way to a
// narrow terminal.
const NAME = 1
const FILE = 7
// The narrowest a cut name gets: past that the table wraps instead.
const MIN_NAME = 12
const GAP = '  '

/**
 * The requests as a person reads them, one row each: an invocation names its function, a web
 * request its web app and route. The list holds every stage run from this service directory, so
 * each row names its stage. Within a terminal's `width` (0: no limit), the File column is left out
 * first (the result has it), then names and routes are cut, with an ellipsis.
 */
export const renderRequests = ({ requests, nowMs, width = 0 }) => {
  const web = requests.some((request) => request.kind === 'request')
  let rows = [
    [
      'When',
      web ? 'Function or web app' : 'Function',
      'Stage',
      'Request',
      'Outcome',
      'Status',
      'Duration',
      'File',
    ],
    ...requests.map((request) => [
      formatAgo(Math.floor(Date.parse(request.ts) / 1000), nowMs),
      request.kind === 'request'
        ? `${request.web_app} ${routeOf(request)}`
        : request.function,
      request.stage ?? '',
      String(request.request_id).slice(0, 8),
      request.outcome,
      request.status_code === undefined || request.status_code === null
        ? ''
        : String(request.status_code),
      `${request.duration_ms} ms`,
      request.file,
    ]),
  ]
  const widthsOf = (table) =>
    table[0].map((_, column) =>
      Math.max(...table.map((row) => stringWidth(row[column]))),
    )
  const lineWidth = (widths) =>
    widths.reduce((sum, each) => sum + each, 0) +
    GAP.length * (widths.length - 1)
  let widths = widthsOf(rows)
  // Like the session's lines, a row keeps off the terminal's last column.
  const room = width > 0 ? width - 1 : Infinity
  if (lineWidth(widths) > room) {
    rows = rows.map((row) => row.filter((_, column) => column !== FILE))
    widths = widthsOf(rows)
  }
  const over = lineWidth(widths) - room
  if (over > 0) {
    const name = Math.max(MIN_NAME, widths[NAME] - over)
    rows = rows.map((row) =>
      row.map((cell, column) => (column === NAME ? cut(cell, name) : cell)),
    )
    widths = widthsOf(rows)
  }
  const pad = (cell, column) =>
    `${cell}${' '.repeat(Math.max(0, widths[column] - stringWidth(cell)))}`
  return rows
    .map((row) =>
      row
        .map((cell, column) =>
          column === row.length - 1 ? cell : pad(cell, column),
        )
        .join(GAP)
        .trimEnd(),
    )
    .map((line, index) => (index === 0 ? style.aside(line) : line))
    .join('\n')
}

export const runDevRequests = async ({
  serviceDir,
  options = {},
  deps = {},
}) => {
  const {
    fs: fsRef = fs,
    list = listRequests,
    listWeb = listWebRequests,
    connect = connectToSession,
    now = Date.now,
    // The terminal's width when it shows the table (0 in a pipe or a log file: nothing is cut).
    width = () => terminalWidth(),
  } = deps
  try {
    const limit = parseLimit(options.limit)
    const functions = [...new Set([].concat(options.function ?? []))]
    const webApps = [...new Set([].concat(options['web-app'] ?? []))]
    const dir = devDirOf(serviceDir)
    const all = !functions.length && !webApps.length
    const lists = await Promise.all([
      ...(all
        ? [list({ dir, limit, fs: fsRef }), listWeb({ dir, limit, fs: fsRef })]
        : []),
      ...functions.map((functionKey) =>
        list({ dir, functionKey, limit, fs: fsRef }),
      ),
      ...webApps.map((webAppKey) =>
        listWeb({ dir, webAppKey, limit, fs: fsRef }),
      ),
    ])
    // Each file as it is reached from where the CLI runs, in the result and the table.
    const requests = lists
      .flat()
      .sort((a, b) => Date.parse(b.ts) - Date.parse(a.ts))
      .slice(0, limit)
      .map((request) => ({ ...request, file: shownPath(request.file) }))
    // Asking about a session's requests is activity: a detached session does not stop for being
    // idle meanwhile. Best effort; the list needs no session.
    try {
      await (await connect({ serviceDir, fs: fsRef }))?.touch()
    } catch {
      // Nothing to keep alive.
    }
    const none = () => {
      if (all) {
        return `No invocations or web requests are recorded in ${shownPath('.serverless/dev/invocations')} or ${shownPath('.serverless/dev/requests')} yet.`
      }
      return [
        functions.length &&
          `No invocations of ${functions.join(', ')} are recorded in ${shownPath('.serverless/dev/invocations')} yet.`,
        webApps.length &&
          `No requests to ${webApps.join(', ')} are recorded in ${shownPath('.serverless/dev/requests')} yet.`,
      ]
        .filter(Boolean)
        .join('\n')
    }
    const human = requests.length
      ? renderRequests({ requests, nowMs: now(), width: width() })
      : none()
    return { result: envelope({ status: 'ok', requests }), human }
  } catch (error) {
    const result = envelope(errorResult(error))
    return { result, human: result.message }
  }
}
