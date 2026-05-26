#!/usr/bin/env node
// Simulates a Go bootstrap that polls /next but never POSTs a response —
// used to exercise the timeout-enforcement path of the runner.
//
// The runner's per-invocation queue arms a timer with the configured
// timeoutMs; this script's job is simply to NOT settle the invocation so
// the timer fires and rejects with OFFLINE_HANDLER_TIMEOUT.

const base = process.env.AWS_LAMBDA_RUNTIME_API
if (!base) {
  console.error('stalling-bootstrap: AWS_LAMBDA_RUNTIME_API not set')
  process.exit(2)
}

async function loop() {
  while (true) {
    let next
    try {
      next = await fetch(`http://${base}/2018-06-01/runtime/invocation/next`)
    } catch {
      // Server gone (terminate path) — exit cleanly so the parent's
      // terminate() doesn't hang waiting for an exit event.
      process.exit(0)
    }
    if (!next.ok) {
      process.exit(0)
    }
    // Drain the body but never POST a response. Loop back to /next.
    await next.json().catch(() => null)
  }
}

loop().catch((e) => {
  console.error('stalling-bootstrap:', e)
  process.exit(1)
})
