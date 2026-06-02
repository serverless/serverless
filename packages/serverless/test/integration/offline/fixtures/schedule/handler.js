'use strict'
// Schedule fixture: two scheduled functions.
//
//   ticker    — schedule: rate(1 minute). Records the synthesized AWS
//               EventBridge scheduled-event the scheduler delivers.
//   cronInput — schedule: { rate: cron(...), input: { foo: 'bar' } }. Records
//               the `input` override the scheduler delivers verbatim.
//
// Each invocation logs a per-function marker (so the test can poll logs() for
// firing) and appends the received event to SCHEDULE_EVENT_LOG as JSON lines
// (so the test can assert the exact event shape a scheduler invoke produces),
// mirroring the websocket event-log-to-file pattern.
const { appendFileSync } = require('node:fs')

function record(marker, event) {
  // Marker line goes to stdout so logs() can detect firing.
  console.log(`SCHEDULE_FIRED ${marker}`)
  const logPath = process.env.SCHEDULE_EVENT_LOG
  if (!logPath) return
  try {
    appendFileSync(logPath, `${JSON.stringify({ marker, event })}\n`)
  } catch {
    // Best-effort: never fail the handler because logging failed.
  }
}

exports.ticker = async (event) => {
  record('ticker', event)
  return { ok: true }
}

exports.cronInput = async (event) => {
  record('cronInput', event)
  return { ok: true }
}
