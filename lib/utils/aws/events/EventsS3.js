'use strict';

/**
 * S3 Events
 */

let SError    = require('../../../ServerlessError'),
    BbPromise = require('bluebird');


module.exports.notification = function(awsConfig, event) {

  if (!event.lambdaArn || !event.bucket || !event.bucketEvents) {
    return BbPromise.reject(new SError(`Missing required event properties.`));
  }

  const S3 = require('../S3')(awsConfig);

  // the AWS method creates or updates the notification configuration,
  // so we don't need to check if we're updating or creating
  let params = {
    Bucket: event.bucket,
    NotificationConfiguration: {
      LambdaFunctionConfigurations: [
        {
          Events: event.bucketEvents,
          LambdaFunctionArn: event.lambdaArn
        }
      ]
    }
  };

  return S3.putBucketNotificationConfigurationPromised(params)
    .then(function(data) {
      return BbPromise.resolve(data);
    });
};