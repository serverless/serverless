'use strict'
// echo: returns the received event so the test can assert the
// requestContext.authorizer surface the handler receives.
exports.echo = async (event) => ({
  statusCode: 200,
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(event),
})
