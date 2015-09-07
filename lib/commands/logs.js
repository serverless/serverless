'use strict';

/**
 * JAWS Command: logs
 * - Fetches logs for your lambdas
 */

// TODO: This is incomplete and needs to be finished.

var JawsError = require('../jaws-error'),
    Promise = require('bluebird'),
    path = require('path'),
    fs = require('fs'),
    AWS = require('../utils/aws');

Promise.promisifyAll(fs);


/**
 * Internal Functions
 */

// Fetch log streams from AWS CloudWatch
function _fetchLogStreams(lambdaFunctionName) {
  return new Promise(function(resolve, reject) {

    var params = {
      logGroupName: 'aws/lambda/' + lambdaFunctionName,
      descending: true,
      limit: 5,
      orderBy: 'LastEventTime'
    };

    AWS.cwGetLogStreams(params, function(error, data) {

      if (error) {
        return reject(new JawsError(
            error.message,
            JawsError.errorCodes.UNKNOWN));
      } else {
        return resolve(data);
      }
    });
  })
}

// Fetch log stream events from AWS CloudWatch
function _fetchLogStreamEvents(logGroupName, logStreamName) {
  return new Promise(function(resolve, reject) {

    var params = {
      logGroupName: logGroupName,
      logStreamName: logStreamName
    };

    cwLogs.cwGetStreamEvents(params, function(err, data) {
      if (error) {
        return reject(new JawsError(
            error.message,
            JawsError.errorCodes.UNKNOWN));
      } else {
        return resolve(data);
      }
    });
  })
}

// Check for new log stream events
function _checkForNewEvents(newEvents, lastEvents) {

}


module.exports.logs = function(JAWS, stage) {

  // // Validate
  // var jawsJsonPath = path.join(process.cwd(), 'jaws.json');

  // // Check if cwd is a lambda function
  // if (!fs.existsSync(jawsJsonPath)) {
  //   reject(new JawsError(
  //     'Could\'nt find a lambda function.  Are you sure you are in a lambda function\'s directory?',
  //     JawsError.errorCodes.UNKNOWN
  //   ));
  // }

  // var jawsJson = require(jawsJsonPath);

  // // Check if jaws.json has 'lambda' profile
  // if (jawsJson.profile !== 'lambda') {
  //   reject(new JawsError(
  //     'This jaws-module is not a lambda function.  Make sure it\'s profile is set to lambda or lambdaGroup',
  //     JawsError.errorCodes.UNKNOWN
  //   ));
  // }

  // // Sanitize
  // var lambdaFunctionName = stage + '_-_' + JAWS._meta.projectJson.name + '_-_' + jawsJson.name;


  // // Process Flow
  // if (true) {

  //   return _fetchLogStreams(lambdaFunctionName)
  //     .then(function(logStreams) {
  //       resolve();
  //       _fetchLogStreamEvents(lambdaFunctionName, logStreams)
  //     });

  // } else {

  //   var timers = {};

  // }
};
