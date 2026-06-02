'use strict'
// Lambda Invoke fixture, driven via the harness invoke() helper (POST to
// /2015-03-31/functions/<name>/invocations).
//
//   worker  — echoes the payload back as the handler return value, so the sync
//             response body IS the JSON the handler returned.
//   thrower — throws, to exercise the Unhandled error envelope.

exports.worker = async (event) => {
  return { ok: true, received: event }
}

exports.thrower = async () => {
  throw new Error('boom from thrower')
}
