'use strict'
// echo: returns the received event so the test can assert a 200 reached the
// handler (the request carried a valid x-api-key).
exports.echo = async (event) => ({
  statusCode: 200,
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(event),
})
