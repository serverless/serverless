'use strict'
// Minimal route handler; the config-compat test only needs a 200 response.
exports.ping = async () => ({
  statusCode: 200,
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ ok: true }),
})
