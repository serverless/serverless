'use strict'
// Echo the received ALB event back as a proper ALB Lambda response so the test
// can assert both the event shape (via the echoed body) and the ALB response
// contract (statusCode, statusDescription, headers, isBase64Encoded, body).
exports.echo = async (event) => ({
  statusCode: 200,
  statusDescription: '200 OK',
  isBase64Encoded: false,
  headers: { 'content-type': 'application/json', 'x-echo': 'yes' },
  body: JSON.stringify(event),
})
