'use strict';

/**
 * JAWS Command: env
 */

var JawsError = require('../jaws-error'),
    JawsCli = require('../utils/cli'),
    JawsEnv = require('../commands/env'),
    Promise = require('bluebird'),
    utils = require('../utils'),
    fs = require('fs'),
    AWSUtils = require('../utils/aws'),
    path = require('path'),
    chalk = require('chalk'),
    dotenv = require('dotenv');

var runHandler = function(handler, event, env) {
  var succeed = function(result) {
    JawsCli.log('Lambda Finished Successfully: ');
    JawsCli.log(JSON.stringify(result));
    return process.exit(0);
  }

  var error = function(error) {
    JawsCli.log(chalk.red('Lambda Returned An Error: '));
    JawsCli.log(chalk.red(JSON.stringify(error)));
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
  return Promise.all([
      utils.findAllJawsJsons(path.join(JAWS._meta.projectRootPath, 'back')),
      JawsEnv.getEnvFileAsMap(JAWS, stage),
    ]).spread(function(jawsJsonPaths, envMap) {

      JawsCli.log_header('Running tests in stage: ' + stage);

      var extension = require(process.cwd() + '/index.js');
      var event     = require(process.cwd() + '/event.json');

      runHandler(extension.handler, event, envMap);
    });
}
