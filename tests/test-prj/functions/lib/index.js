'use strict';

var AWS       = require('aws-sdk'),
    ld        = require('lodash'),
    async     = require('async'),
    request   = require('request'),
    us        = require('underscore'),
    moment    = require('moment'),
    uuid      = require('node-uuid'),
    path      = require('path'),
    BbPromise = require('bluebird');

/**
 * Complex Test
 */

module.exports.complex = function(event, context, cb) {

  return new BbPromise(function(resolve, reject) {

    console.log('moment', moment().format());
    console.log('v1', uuid.v1());
    console.log('v4', uuid.v4());
    console.log('env vars', process.env);

    return resolve([
      moment().format(),
      uuid.v1(),
      uuid.v4()
    ]);
  })
      .then(function(d) {
        return cb(null, d);
      })
      .catch(function(e) {
        console.log(e);
        return cb(e, null);
      });
};