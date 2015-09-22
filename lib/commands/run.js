'use strict';

/**
 * JAWS Command: run
 */

var JawsError = require('../jaws-error'),
    JawsCli = require('../utils/cli'),
    JawsEnv = require('../commands/env'),
    Promise = require('bluebird'),
    utils = require('../utils'),
    path = require('path')

var runHandler = function(handler, event, env) {
  var succeed = function(result) {
    return process.exit(0);
  }

  var error = function(error) {
    return process.exit(0);
  }

  var context = {
    succeed: succeed,
    error: error,
    fail: error,
    done: function(err, result) {
      if (err) {
        error(err)
      }

      if (result) {
        succeed(result)
      }

      return process.exit(0);
    }
  };

  var old_env = process.env;
  try {
    process.env = env;
    handler(event, context);
  } finally {
    process.env = old_env;
  }
}

/**
 *
 * @param {Jaws} JAWS
 * @param stage
 */

module.exports.run = function(JAWS, stage) {

  var envCmd = require('./env');
  var envMap = envCmd.getEnvFileAsMap(JAWS, stage);

  return new Promise(function() {
    var event     = require(process.cwd() + '/event.json');
    var handler   = require(process.cwd() + '/handler.js');

    runHandler(handler.handler, event, envMap);
  });
}
