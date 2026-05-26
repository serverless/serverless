#!/usr/bin/env node
// Simulates a Java RIC that polls /next but never POSTs a response —
// used to exercise the timeout-enforcement path of the runner.

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
      process.exit(0)
    }
    if (!next.ok) {
      process.exit(0)
    }
    await next.json().catch(() => null)
  }
}

loop().catch((e) => {
  console.error('stalling-bootstrap:', e)
  process.exit(1)
})
