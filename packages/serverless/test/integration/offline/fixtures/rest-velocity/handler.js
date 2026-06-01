'use strict'
// proxy: echo the received event so the test can assert the APIGW v1 proxy shape.
exports.proxy = async (event) => ({
  statusCode: 200,
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(event),
})

// velocity: receives the velocity-mapped input (NOT the raw HTTP request). It
// echoes the mapped fields back so the test can assert the request template was
// applied, and re-emits `who` as `echoedWho` so the response template can render
// it. When the mapped `who` is the string 'missing', it throws an error whose
// message matches the 404 status-code mapping pattern.
exports.velocity = async (input) => {
  if (input && input.who === 'missing') {
    throw new Error('item not found')
  }
  return { ...input, echoedWho: input && input.who }
}
