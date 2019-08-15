'use strict';

const crypto = require('crypto');
const AWS = require('aws-sdk');

function generateId(functionName, bucketConfig) {
  const md5 = crypto
    .createHash('md5')
    .update(JSON.stringify(bucketConfig))
    .digest('hex');
  return `${functionName}-${md5}`;
}

function createFilter(config) {
  const rules = config.Rules;
  if (rules && rules.length) {
    const FilterRules = rules.map(rule => {
      const key = Object.keys(rule)[0];
      const Name = key.toLowerCase();
      const Value = rule[key];
      return {
        Name,
        Value,
      };
    });
    return {
      Key: {
        FilterRules,
      },
    };
  }
  return undefined;
}

function getConfiguration(config) {
  const { bucketName, region } = config;
  const s3 = new AWS.S3({ region });
  const Bucket = bucketName;
  const payload = {
    Bucket,
  };
  return s3
    .getBucketNotificationConfiguration(payload)
    .promise()
    .then(data => data);
}

function updateConfiguration(config) {
  const { lambdaArn, functionName, bucketName, bucketConfigs, region } = config;
  const s3 = new AWS.S3({ region });
  const Bucket = bucketName;

  return getConfiguration(config).then(NotificationConfiguration => {
    // remove configurations for this specific function
    NotificationConfiguration.LambdaFunctionConfigurations = NotificationConfiguration.LambdaFunctionConfigurations.filter(
      conf => !conf.Id.startsWith(functionName)
    );

    // add the events to the existing NotificationConfiguration
    bucketConfigs.forEach(bucketConfig => {
      const Events = [bucketConfig.Event];
      const LambdaFunctionArn = lambdaArn;
      const Id = generateId(functionName, bucketConfig);
      const Filter = createFilter(bucketConfig);
      NotificationConfiguration.LambdaFunctionConfigurations.push({
        Events,
        LambdaFunctionArn,
        Filter,
        Id,
      });
    });

    const payload = {
      Bucket,
      NotificationConfiguration,
    };
    return s3.putBucketNotificationConfiguration(payload).promise();
  });
}

function removeConfiguration(config) {
  const { functionName, bucketName, region } = config;
  const s3 = new AWS.S3({ region });
  const Bucket = bucketName;

  return getConfiguration(config).then(NotificationConfiguration => {
    // remove configurations for this specific function
    NotificationConfiguration.LambdaFunctionConfigurations = NotificationConfiguration.LambdaFunctionConfigurations.filter(
      conf => !conf.Id.startsWith(functionName)
    );

    const payload = {
      Bucket,
      NotificationConfiguration,
    };
    return s3.putBucketNotificationConfiguration(payload).promise();
  });
}

module.exports = {
  updateConfiguration,
  removeConfiguration,
};
