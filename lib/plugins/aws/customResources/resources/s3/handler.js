'use strict';

const { addPermission, removePermission } = require('./lib/permissions');
const { updateConfiguration, removeConfiguration } = require('./lib/bucket');
const { getEnvironment, getLambdaArn, handlerWrapper } = require('../utils');

function handler(event, context) {
  if (event.RequestType === 'Create') {
    return create(event, context);
  } else if (event.RequestType === 'Update') {
    return update(event, context);
  } else if (event.RequestType === 'Delete') {
    return remove(event, context);
  }
  throw new Error(`Unhandled RequestType ${event.RequestType}`);
}

function create(event, context) {
  const { Region, AccountId } = getEnvironment(context);
  const { FunctionName, BucketName, BucketConfigs } = event.ResourceProperties;

  const lambdaArn = getLambdaArn(Region, AccountId, FunctionName);

  return addPermission({
    functionName: FunctionName,
    bucketName: BucketName,
    region: Region,
  }).then(() =>
    updateConfiguration({
      lambdaArn,
      region: Region,
      functionName: FunctionName,
      bucketName: BucketName,
      bucketConfigs: BucketConfigs,
    })
  );
}

function update(event, context) {
  const { Region, AccountId } = getEnvironment(context);
  const { FunctionName, BucketName, BucketConfigs } = event.ResourceProperties;

  const lambdaArn = getLambdaArn(Region, AccountId, FunctionName);

  return updateConfiguration({
    lambdaArn,
    region: Region,
    functionName: FunctionName,
    bucketName: BucketName,
    bucketConfigs: BucketConfigs,
  });
}

function remove(event, context) {
  const { Region } = getEnvironment(context);
  const { FunctionName, BucketName } = event.ResourceProperties;

  return removePermission({
    functionName: FunctionName,
    bucketName: BucketName,
    region: Region,
  }).then(() =>
    removeConfiguration({
      region: Region,
      functionName: FunctionName,
      bucketName: BucketName,
    })
  );
}

module.exports = {
  handler: handlerWrapper(handler, 'CustomResourceExistingS3'),
};
