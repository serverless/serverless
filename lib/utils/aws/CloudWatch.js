'use strict';

/**
 * JAWS Services: AWS: CloudWatch
 * - Prefix custom methods with "s"
 */

let BbPromise = require('bluebird'),
    path      = require('path'),
    os        = require('os'),
    AWS       = require('aws-sdk'),
    JawsError = require('../../jaws-error'),
    JawsUtils = require('../../utils'),
    async     = require('async'),
    fs        = require('fs');

// Promisify fs module. This adds "Async" to the end of every method
BbPromise.promisifyAll(fs);

module.exports = function(config) {

  // Promisify and configure instance
  const CloudWatch = BbPromise.promisifyAll(new AWS.CloudWatchLogs(config));
  
  // Get Log Streams
  CloudWatch.sGetLogStreams = function(logGroupName, limit) {

      let params = {
        logGroupName: logGroupName,
        descending:   true,
        limit:        limit || 5,
        orderBy:      'LastEventTime',
      };
      
      return CloudWatch.describeLogStreamsAsync(params)
        .error(function(error) {
          BbPromise.reject(new JawsError(error.message, JawsError.errorCodes.UNKNOWN);
        });
  };
  
  // Get Log Stream Events
  CloudWatch.sGetStreamEvents = function(logGroupName, logStreamName) {
    let params = {
      logGroupName:  logGroupName,
      logStreamName: logStreamName,
    };
    
    return CloudWatch.getLogEventsAsync(params)
      .error(function(error) {
        BbPromise.reject(new JawsError(error.message, JawsError.errorCodes.UNKNOWN);
      });
  };

  // Return configured, customized instance
  return CloudWatch;

};
