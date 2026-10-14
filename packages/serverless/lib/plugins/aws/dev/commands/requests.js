/**
 * `serverless dev requests`: the latest invocations Dev Mode ran on this machine, newest first,
 * read from .serverless/dev/invocations, so no session is needed. Each one names its file, which
 * holds the event, the response or error, and the logs.
 */
import fs from 'fs'
import { ServerlessError } from '@serverless/util'
// Subpath import: tests that load every plugin mock '@serverless/util' wholesale.
import { style } from '@serverless/util/src/logger/index.js'
import { formatAgo } from '../attach/output.js'
import { connectToSession } from '../control/client.js'
import { devDirOf } from '../state/paths.js'
import { listRequests } from '../state/read.js'
import { envelope, errorResult } from './envelope.js'
import { shownPath } from './cli-names.js'

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

/**
 * The requests as a person reads them, one row each. The list holds every stage run from this
 * service directory, so each row names its stage.
 */
export const renderRequests = ({ requests, nowMs }) => {
  const rows = [
    [
      'When',
      'Function',
      'Stage',
      'Request',
      'Outcome',
      'Status',
      'Duration',
      'File',
    ],
    ...requests.map((request) => [
      formatAgo(Math.floor(Date.parse(request.ts) / 1000), nowMs),
      request.function,
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
  const widths = rows[0].map((_, column) =>
    Math.max(...rows.map((row) => row[column].length)),
  )
  return rows
    .map((row) =>
      row
        .map((cell, column) =>
          column === row.length - 1 ? cell : cell.padEnd(widths[column]),
        )
        .join('  ')
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
    connect = connectToSession,
    now = Date.now,
  } = deps
  try {
    const limit = parseLimit(options.limit)
    const functions = [...new Set([].concat(options.function ?? []))]
    const dir = devDirOf(serviceDir)
    const lists = functions.length
      ? await Promise.all(
          functions.map((functionKey) =>
            list({ dir, functionKey, limit, fs: fsRef }),
          ),
        )
      : [await list({ dir, limit, fs: fsRef })]
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
    const human = requests.length
      ? renderRequests({ requests, nowMs: now() })
      : `No invocations${functions.length ? ` of ${functions.join(', ')}` : ''} are recorded in ${shownPath('.serverless/dev/invocations')} yet.`
    return { result: envelope({ status: 'ok', requests }), human }
  } catch (error) {
    const result = envelope(errorResult(error))
    return { result, human: result.message }
  }
}
