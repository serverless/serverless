#!/usr/bin/env node
/**
 * Simulates a Go bootstrap binary polling the AWS Lambda Runtime API.
 *
 * Used by go.test.js as a drop-in `binaryPath` so the Go runner can be
 * exercised end-to-end without requiring a real Go toolchain. Reads
 * `AWS_LAMBDA_RUNTIME_API` (set by the runner per AWS spec — host:port form,
 * no scheme), then loops over `GET /next` → echo payload → `POST /response`.
 *
 * Exits cleanly when /next fails (e.g. server stops, abort during runner
 * terminate()). Any unexpected failure is logged to stderr and bubbles up
 * with a non-zero exit code so test failures are easy to diagnose.
 */
const base = process.env.AWS_LAMBDA_RUNTIME_API
if (!base) {
  console.error('fake-bootstrap: AWS_LAMBDA_RUNTIME_API not set')
  process.exit(2)
}

async function loop() {
  while (true) {
    let next
    try {
      next = await fetch(`http://${base}/2018-06-01/runtime/invocation/next`)
    } catch (err) {
      // Server gone (terminate() killed us between polls) — exit cleanly.
      console.error('fake-bootstrap: /next fetch failed:', err.message)
      process.exit(0)
    }
    if (!next.ok) {
      console.error('fake-bootstrap: /next returned', next.status)
      process.exit(3)
    }
    const requestId = next.headers.get('lambda-runtime-aws-request-id')
    const payload = await next.json()
    const response = { ok: true, received: payload }
    await fetch(
      `http://${base}/2018-06-01/runtime/invocation/${requestId}/response`,
      {
        method: 'POST',
        body: JSON.stringify(response),
        headers: { 'content-type': 'application/json' },
      },
    )
  }
}

loop().catch((e) => {
  console.error('fake-bootstrap:', e)
  process.exit(1)
})
