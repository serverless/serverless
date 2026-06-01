'use strict'
// Echo the received event so the test can assert the APIGW v2 event shape.
exports.echo = async (event) => ({
  statusCode: 200,
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(event),
})
