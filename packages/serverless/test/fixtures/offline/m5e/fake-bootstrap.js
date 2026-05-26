#!/usr/bin/env node
// Simulates a Java RIC polling Lambda Runtime API.
// The real `com.amazonaws.services.lambda.runtime.api.client.AWSLambda`
// reads AWS_LAMBDA_RUNTIME_API + _HANDLER from env, polls /next, invokes
// the user handler, and posts back to /response or /error.
//
// For unit tests we replace the JVM with this Node script so the runner
// queue/HTTP/child round-trip can be exercised without a JDK on CI.

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
    } catch {
      process.exit(0)
    }
    if (!next.ok) {
      process.exit(0)
    }
    const requestId = next.headers.get('lambda-runtime-aws-request-id')
    const payload = await next.json()
    const response = {
      ok: true,
      received: payload,
      handler: process.env._HANDLER ?? '',
    }
    await fetch(
      `http://${base}/2018-06-01/runtime/invocation/${requestId}/response`,
      {
        method: 'POST',
        body: JSON.stringify(response),
        headers: { 'content-type': 'application/json' },
      },
    ).catch(() => {})
  }
}

loop().catch((e) => {
  console.error('fake-bootstrap:', e)
  process.exit(1)
})
