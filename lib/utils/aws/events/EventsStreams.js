'use strict';

/**
 * Stream Events (DynamoDB Streams & Kinesis Streams)
 */

let SError    = require('../../../ServerlessError'),
    SUtils    = require('./utils/index'),
    BbPromise = require('bluebird');

module.exports.stream = function(awsConfig, event) {

  // Validate required properties
  if (!awsConfig || !event.lambdaArn || !event.streamArn || typeof event.enabled === 'undefined') {
    return BbPromise.reject(new SError(`Missing required event properties.`));
  }

  event.startingPosition = event.startingPosition || 'TRIM_HORIZON';
  event.batchSize = event.batchSize || 100;
  event.enabled = event.enabled ? true : false;

  const Lambda = require('../Lambda')(awsConfig);

  let params = {
    FunctionName: event.lambdaArn,
    BatchSize: event.batchSize,
    Enabled: event.enabled
  };

  // Update or Create
  if (event.id) {
    params.UUID = event.id;

    return Lambda.updateEventSourceMappingPromised(params)
      .then(function (data) {

        SUtils.sDebug(`updated stream event source ${event.streamArn} for lambda ${event.lambdaArn}`);

        return BbPromise.resolve(data);
      });

  } else {
    params.EventSourceArn = event.streamArn;
    params.StartingPosition = event.startingPosition;

    return Lambda.createEventSourceMappingPromised(params)
      .then(function (data) {

        SUtils.sDebug(`Created stream event source ${event.streamArn} for lambda ${event.lambdaArn}`);

        return BbPromise.resolve(data);
      });
  }


};