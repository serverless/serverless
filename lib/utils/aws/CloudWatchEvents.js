'use strict';

/**
 * Serverless Services: AWS: CloudWatchEvents
 * - Prefix custom methods with "s"
 */

let BbPromise = require('bluebird'),
    AWS       = require('aws-sdk');

module.exports = function(config) {

  // Promisify and configure instance
  const CloudWatchEvents = BbPromise.promisifyAll(new AWS.CloudWatchEvents(config));


  // Return configured, customized instance
  return CloudWatchEvents;
};
