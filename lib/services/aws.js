'use strict';

/**
 * JAWS Services: AWS
 */

var Promise = require('bluebird'),
  AWS = require('aws-sdk'),
  path = require('path'),
  os = require('os'),
  JawsError = require('../jaws-error'),
  fs = require('fs');

Promise.promisifyAll(fs);

/**
 * Config AWS
 */

if (JAWS._meta.profile) {
  var credentials = new AWS.SharedIniFileCredentials({
    profile: JAWS._meta.profile
  });
  AWS.config.credentials = credentials;
}


module.exports = function(JAWS) {

  JAWS.AWS = {};


  /**
   * CloudWatchLogs: Describe Log Streams
   */

  JAWS.AWS.describeLogStreams = function(logGroupName, limit) {
    return new Promise(function(resolve, reject) {

      // Instantiate
      var cwLogs = new AWS.CloudWatchLogs({
        apiVersion: '2014-03-28'
      });

      var params = {
        logGroupName: logGroupName,
        descending: true,
        limit: limit || 5,
        orderBy: 'LastEventTime'
      };

      cwLogs.describeLogStreams(params, function(error, data) {

        if (error) {
          return reject(new JawsError(
            error.message,
            JawsError.errorCodes.UNKNOWN));
        } else {
          return resolve(data);
        }
      });
    });
  }

  /**
   * CloudWatchLogs: Fetch log stream events
   */

  JAWS.AWS.getLogStreamEvents = function(logGroupName, logStreamName) {
    return new Promise(function(resolve, reject) {

      // Instantiate
      var cwLogs = new AWS.CloudWatchLogs({
        apiVersion: '2014-03-28'
      });

      var params = {
        logGroupName: logGroupName,
        logStreamName: logStreamName
      };

      cwLogs.getLogEvents(params, function(err, data) {
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
}
