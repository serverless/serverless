/**
 * The web app requests on the terminal, in the invocation stream's style
 * (local/invocation-output.js), one line each: a page load is many requests, so each prints only
 * when it ends, `web <key>` where an invocation shows `λ <function>`, with no blank line between
 * requests. The line names the method and the path as the request's file keeps it (signed-URL
 * query values redacted), the local server's status code or what happened instead (`(deployed
 * code)` for a relayed request this machine left to the deployed code, `(not run)` for a local one
 * whose server was not running, `✕` for one that failed), the duration, the source when the request
 * did not come through the relay (`local`, `replay`) and the first 8 characters of its request id.
 * A request still running after SLOW_REQUEST_MS (a stream, a slow page) also gets an arrival line
 * then, with the same id. Lines keep within the terminal's width as the invocation lines do (the
 * path gives way first, then the reason, never the status, the duration or the id) unless detailed
 * output is on. Everything taken from a request is made printable first.
 *
 * Detailed output (`--detailed`, the `v` key) also shows what an invocation's details show, under
 * the request's line: its headers, the head of its body and the response's status, headers and
 * body head (credentials redacted, as the request's file keeps them; bodies cut at
 * DETAIL_BODY_BYTES). Bodies show only when the session keeps a record.
 *
 * Its interface is the request recorder's (state/requests.js): `recordingWith` gives the relay and
 * the dispatch one recorder that tells both.
 */
import util from 'util'
import stringWidth from 'string-width'
// Subpath import: tests that load every plugin mock '@serverless/util' wholesale.
import { stringToSafeColor, style } from '@serverless/util/src/logger/index.js'
import { clean, formatDuration, printable } from '../mcp-log.js'
import { colorsShown, cut, shortId } from '../local/invocation-output.js'
import {
  UNRECORDED_PATH,
  bodyFieldsOf,
  redactPath,
  redactRequestHeaders,
} from '../state/requests.js'

/** How much of each body detailed output shows; the request's file keeps more. */
export const DETAIL_BODY_BYTES = 2048
/** How long a request runs before it gets an arrival line of its own. */
export const SLOW_REQUEST_MS = 1000

// The arrival lines' timers never keep the CLI running.
const unrefTimers = {
  setTimeout: (fn, ms) => {
    const handle = setTimeout(fn, ms)
    handle.unref?.()
    return handle
  },
  clearTimeout: (handle) => clearTimeout(handle),
}

// A line break inside a value would leave the rest of it on a line of its own.
const oneLine = (value) =>
  value === undefined || value === null
    ? ''
    : String(value).replace(/\r?\n/g, ' ')
const pathOnly = (text) => String(text ?? '').split('?')[0]

/**
 * `write` takes each line (no trailing newline), `idle` is called once no request runs any more.
 * `width()` is the terminal's width (0: no limit), `detailed()` whether detailed output is on
 * (nothing is cut then). Colour follows the CLI logger's colour rule (NO_COLOR, pipes, AI agents),
 * as the invocation lines do.
 */
export const createRequestOutput = ({
  write,
  idle = () => {},
  width = () => 0,
  detailed = () => false,
  now = Date.now,
  timers = unrefTimers,
  colors = colorsShown,
}) => {
  // The requests shown when they end, by id.
  const inFlight = new Map()
  const dump = (value) => util.inspect(value, { depth: null, colors: colors() })
  /** A body as detailed output shows it: its head, its size, and whether it was cut. */
  const shownBody = (body) => {
    if (!body) return undefined
    const head = Buffer.isBuffer(body.head)
      ? body.head.subarray(0, DETAIL_BODY_BYTES)
      : body.head
    const fields = bodyFieldsOf({ head, bytes: body.bytes })
    return {
      body: fields.body,
      ...(fields.body_encoding === 'base64' && { body_encoding: 'base64' }),
      body_bytes: fields.body_bytes,
      ...(fields.body_truncated && { body_truncated: true }),
    }
  }
  const colorOf = (id) => stringToSafeColor(String(id ?? ''))
  const roomFor = (max) => max > 0 && !detailed()
  const labelOf = (method, path) => {
    const shown = redactPath(oneLine(path)).path
    return detailed()
      ? `${clean(oneLine(method)).toUpperCase()} ${clean(shown)}`
      : `${(printable(oneLine(method)) ?? '?').toUpperCase()} ${printable(shown) ?? '/'}`
  }

  /** The arrival line of a request still running after SLOW_REQUEST_MS. */
  const arrived = (id) => {
    const entry = inFlight.get(id)
    if (!entry) return
    entry.timer = null
    const aside = `· ${entry.source === 'relay' ? '' : `${entry.source} · `}${shortId(id)}`
    const head = `→ web ${entry.key} ── `
    const max = width()
    const room = roomFor(max)
      ? max - 1 - stringWidth(head) - 1 - stringWidth(aside)
      : Infinity
    write(
      `${colorOf(id)('→')} web ${entry.key} ── ${cut(entry.label, room)} ${style.aside(aside)}`,
    )
  }

  return {
    start({ id, key, method, path, source, at, headers }) {
      if (pathOnly(path) === UNRECORDED_PATH) return
      const entry = {
        key,
        startedAt: at ?? now(),
        source: source ?? 'relay',
        label: labelOf(method, path),
        headers,
      }
      inFlight.set(id, entry)
      entry.timer = timers.setTimeout(() => {
        try {
          arrived(id)
        } catch {
          // The terminal is gone: the end line still comes.
        }
      }, SLOW_REQUEST_MS)
    },
    /** What the dispatch saw of a request (state/requests.js `note`), for detailed output. */
    note({ id, ...fields }) {
      const entry = inFlight.get(id)
      if (!entry) return
      for (const name of ['requestBody', 'response', 'responseBody']) {
        if (fields[name] !== undefined) entry[name] = fields[name]
      }
    },
    end({ id, key, at, durationMs, outcome, status, reason }) {
      const entry = inFlight.get(id)
      if (!entry) return
      inFlight.delete(id)
      if (entry.timer) timers.clearTimeout(entry.timer)
      const details = [
        formatDuration(durationMs ?? (at ?? now()) - entry.startedAt),
        ...(entry.source === 'relay' ? [] : [entry.source]),
        shortId(id),
      ].join(' · ')
      const why = clean(oneLine(reason)).trim()
      // What the request came to: its tag is kept whole, the rest takes what is left.
      let tag
      let rest = ''
      let tone = (text) => text
      if (outcome === 'not_run') {
        // Not answered here: a relayed request ran the deployed code, a local one nothing.
        tag = entry.source === 'relay' ? '(deployed code)' : '(not run)'
        rest = why ? `── ${why}` : ''
        tone = style.warning
      } else if (outcome === 'failed') {
        // The failure's mark stays even when nothing else fits.
        tag = '✕'
        rest = `${Number.isInteger(status) ? `(${status}) ` : ''}${why || 'failed'}`
        tone = style.error
      } else {
        tag = `(${Number.isInteger(status) ? status : '?'})`
        if (status < 400) tone = style.success
      }
      const max = width()
      // The line keeps within the terminal: the path gives way first, then the rest of the
      // outcome, never its tag, the duration or the request id. The request's file keeps it all.
      let room = roomFor(max)
        ? max - 1 - stringWidth(`← web ${key} ── `) - 1 - stringWidth(details)
        : Infinity
      const label = cut(entry.label, room - stringWidth(tag) - 1)
      if (label) room -= stringWidth(label) + 1
      const kept = cut(tag, room)
      room -= stringWidth(kept)
      const shownRest = rest && room > 1 ? cut(rest, room - 1) : ''
      const outcomeText = shownRest ? `${kept} ${shownRest}` : kept
      // A failure is one colour; otherwise the tag carries the colour.
      const shown =
        outcome === 'failed'
          ? tone(outcomeText)
          : [tone(kept), shownRest].filter(Boolean).join(' ')
      write(
        [
          `${colorOf(id)('←')} web ${key} ──`,
          label,
          shown,
          style.aside(details),
        ]
          .filter(Boolean)
          .join(' '),
      )
      if (detailed()) {
        const request = {
          ...(entry.headers && {
            headers: redactRequestHeaders(entry.headers).headers,
          }),
          ...shownBody(entry.requestBody),
        }
        const response = entry.response && {
          status_code: entry.response.status,
          headers: redactRequestHeaders(entry.response.headers).headers,
          ...shownBody(entry.responseBody),
        }
        const hasRequest = Object.keys(request).length > 0
        const showResponse = response && outcome !== 'not_run'
        if (hasRequest || showResponse) {
          write(
            dump({
              ...(hasRequest && { request }),
              ...(showResponse && { response }),
            }),
          )
        }
      }
      if (inFlight.size === 0) idle()
    },
  }
}

/**
 * One recorder for the relay and the dispatch that tells `output` (createRequestOutput) and
 * `recorder` (the session's request recorder, or null when the session keeps no record) of each
 * request. The record asks for bodies (`captureBytes`, `note`) only when there is one; an output
 * that throws never stops the record.
 */
export const recordingWith = (recorder, output) => {
  const tell = (fn) => {
    try {
      fn()
    } catch {
      // The terminal is gone: the record goes on.
    }
  }
  return {
    ...(recorder?.captureBytes !== undefined && {
      captureBytes: recorder.captureBytes,
    }),
    ...(typeof recorder?.note === 'function' && {
      note: (fields) => {
        tell(() => output.note?.(fields))
        recorder.note(fields)
      },
    }),
    start(fields) {
      tell(() => output.start(fields))
      recorder?.start?.(fields)
    },
    end(fields) {
      tell(() => output.end(fields))
      recorder?.end?.(fields)
    },
  }
}
