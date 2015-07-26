/*!
 * method-override
 * Copyright(c) 2010 Sencha Inc.
 * Copyright(c) 2011 TJ Holowaychuk
 * Copyright(c) 2014 Jonathan Ong
 * Copyright(c) 2014 Douglas Christopher Wilson
 * MIT Licensed
 */

/**
 * Module dependencies.
 */

var debug = require('debug')('method-override')
var methods = require('methods');
var parseurl = require('parseurl');
var querystring = require('querystring');
var vary = require('vary');

/**
 * Method Override:
 *
 * Provides faux HTTP method support.
 *
 * Pass an optional `getter` to use when checking for
 * a method override.
 *
 * A string is converted to a getter that will look for
 * the method in `req.body[getter]` and a function will be
 * called with `req` and expects the method to be returned.
 * If the string starts with `X-` then it will look in
 * `req.headers[getter]` instead.
 *
 * The original method is available via `req.originalMethod`.
 *
 * @param {string|function} [getter=X-HTTP-Method-Override]
 * @param {object} [options]
 * @return {function}
 * @api public
 */

module.exports = function methodOverride(getter, options){
  options = options || {}

  // get the getter fn
  var get = typeof getter === 'function'
    ? getter
    : createGetter(getter || 'X-HTTP-Method-Override')

  // get allowed request methods to examine
  var methods = options.methods === undefined
    ? ['POST']
    : options.methods

  return function methodOverride(req, res, next) {
    var method
    var val

    req.originalMethod = req.originalMethod || req.method

    // validate request is an allowed method
    if (methods && methods.indexOf(req.originalMethod) === -1) {
      return next()
    }

    val = get(req, res)
    method = Array.isArray(val)
      ? val[0]
      : val

    // replace
    if (method !== undefined && supports(method)) {
      req.method = method.toUpperCase()
      debug('override %s as %s', req.originalMethod, req.method)
    }

    next()
  }
}

/**
 * Create a getter for the given string.
 */

function createGetter(str) {
  if (str.substr(0, 2).toUpperCase() === 'X-') {
    // header getter
    return createHeaderGetter(str)
  }

  return createQueryGetter(str)
}

/**
 * Create a getter for the given query key name.
 */

function createQueryGetter(key) {
  return function(req, res) {
    var url = parseurl(req)
    var query = querystring.parse(url.query || '')
    return query[key]
  }
}

/**
 * Create a getter for the given header name.
 */

function createHeaderGetter(str) {
  var header = str.toLowerCase()

  return function(req, res) {
    // set appropriate Vary header
    vary(res, str)

    // multiple headers get joined with comma by node.js core
    return (req.headers[header] || '').split(/ *, */)
  }
}

/**
 * Check if node supports `method`.
 */

function supports(method) {
  return method
    && typeof method === 'string'
    && methods.indexOf(method.toLowerCase()) !== -1
}
