/*!
 * forwarded
 * Copyright(c) 2014 Douglas Christopher Wilson
 * MIT Licensed
 */

/**
 * Module exports.
 */

module.exports = forwarded

/**
 * Get all addresses in the request, using the `X-Forwarded-For` header.
 *
 * @param {Object} req
 * @api public
 */

function forwarded(req) {
  if (!req) {
    throw new TypeError('argument req is required')
  }

  // simple header parsing
  var proxyAddrs = (req.headers['x-forwarded-for'] || '')
    .split(/ *, */)
    .filter(Boolean)
    .reverse()
  var socketAddr = req.connection.remoteAddress
  var addrs = [socketAddr].concat(proxyAddrs)

  // return all addresses
  return addrs
}
