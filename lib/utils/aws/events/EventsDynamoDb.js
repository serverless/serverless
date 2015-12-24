'use strict';

/**
 * DynamoDb Events
 */

let SError  = require('../../../ServerlessError');

/**
 * Stream
 * - Required Properties: streamArn, startingPosition, enabled, batchSize
 */

module.exports.stream = function(S, region, functionName, event) {

  // Validate required properties
  if (!functionName    ||
      !event.streamArn ||
      typeof event.enabled === 'undefined') {
    throw new SError(`Missing required event properties.  Please check your event object for any missing properties.`);
  }

  // Load AWS Service Instances
  let awsConfig = {
    region:          region,
    accessKeyId:     S._awsAdminKeyId,
    secretAccessKey: S._awsAdminSecretKey,
  };
  const Lambda = require('../Lambda')(awsConfig);

  // Set defaults
  event.enabled          = event.enabled ? true : false;
  event.batchSize        = event.batchSize ? event.batchSize : 100;
  event.startingPosition = event.startingPosition ? event.startingPosition : 'TRIM_HORIZON';

  // TODO: If event.id, update event, otherwise create it.  Don't use UUID, only id




};