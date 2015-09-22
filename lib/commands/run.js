'use strict';

/**
 * JAWS Command: run
 */

var JawsError = require('../jaws-error'),
    JawsCli   = require('../utils/cli'),
    JawsEnv   = require('../commands/env'),
    Promise   = require('bluebird'),
    utils     = require('../utils'),
    path      = require('path'),
    fs        = require('fs')
    context   = require('../utils/context');

var runHandler = function(handler, event, env) {

  var old_env = process.env;
  try {
    process.env = env;
    handler(event, context(function(err, result) {
      if (err) {
        console.log("Error: " + err);
        return;
      }
      console.log(result);
    }));
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
  return envCmd.getEnvFileAsMap(JAWS, stage).then(function(envMap) {
    var event     = require(process.cwd() + '/event.json');
    var handler;
    if (fs.existsSync(process.cwd() + '/handler.js')) {
      handler = require(process.cwd() + '/handler.js');
    } else {
     handler = require(process.cwd() + '/index.js');
    }

    runHandler(handler.handler, event, envMap);
  });
}
