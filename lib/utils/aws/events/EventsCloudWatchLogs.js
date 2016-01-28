'use strict';

/**
 * CloudWatch Logs Events
 */

let SError    = require('../../../ServerlessError'),
    BbPromise = require('bluebird');


module.exports.subscribe = function(awsConfig, event) {

  if (!awsConfig || !event.filtername || !event.lambdaArn || !event.filterPattern || !event.logGroupName || !event.roleArn) {
    return BbPromise.reject(new SError(`Missing required event properties.`));
  }

  // the AWS method creates or updates the subscription, so we don't need
  // to check if we're updating or creating
  const CloudWatchLogs = require('../CloudWatch')(awsConfig);

  let params = {
    destinationArn: event.lambdaArn,
    filterName: event.filterName,
    filterPattern: event.filterPattern,
    logGroupName: event.logGroupName,
    roleArn: event.roleArn
  };

  return CloudWatchLogs.putSubscriptionFilterAsync(params);
};