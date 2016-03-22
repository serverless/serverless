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

  // handle prefix and suffix rules
  if (event.prefix || event.suffix) {
    // create the prefix/suffix s3 filter
    params.NotificationConfiguration.LambdaFunctionConfigurations[0].Filter = {
      Key: {
        FilterRules: []
      }
    };

    if (event.prefix) {
      var prefix = {
        Name: 'prefix',
        Value: event.prefix
      };
      params.NotificationConfiguration.LambdaFunctionConfigurations[0].Filter.Key.FilterRules.push(prefix);
    }

    if (event.suffix) {
      var suffix = {
        Name: 'suffix',
        Value: event.suffix
      };
      params.NotificationConfiguration.LambdaFunctionConfigurations[0].Filter.Key.FilterRules.push(suffix);
    }
  }

  return S3.putBucketNotificationConfigurationPromised(params)
    .then(function(data) {
      return BbPromise.resolve(data);
    });
};
