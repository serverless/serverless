'use strict';

const BbPromise = require('bluebird');
const AWS = require('aws-sdk');

const CF = new AWS.CloudFormation({ region: 'us-east-1' });
const S3 = new AWS.S3({ region: 'us-east-1' });

BbPromise.promisifyAll(CF, { suffix: 'Promised' });
BbPromise.promisifyAll(S3, { suffix: 'Promised' });

const logger = console;

const emptyS3Bucket = (bucket) => (
  S3.listObjectsPromised({ Bucket: bucket })
    .then(data => {
      logger.log('Bucket', bucket, 'has', data.Contents.length, 'items');
      if (data.Contents.length) {
        const keys = data.Contents.map(item => Object.assign({}, { Key: item.Key }));
        return S3.deleteObjectsPromised({
          Bucket: bucket,
          Delete: {
            Objects: keys,
          },
        });
      }
      return BbPromise.resolve();
    })
);

const deleteS3Bucket = (bucket) => (
  emptyS3Bucket(bucket)
    .then(() => {
      logger.log('Bucket', bucket, 'is now empty, deleting ...');
      return S3.deleteBucketPromised({ Bucket: bucket });
    })
);

const cleanupS3Buckets = (token) => {
  logger.log('Looking through buckets ...');

  const params = {};

  if (token) {
    params.NextToken = token;
  }

  return S3.listBucketsPromised()
    .then(response =>
      response.Buckets.reduce((memo, bucket) => memo
        .then(() => deleteS3Bucket(bucket.Name)), BbPromise.resolve())
        .then(() => {
          if (response.NextToken) {
            return cleanupS3Buckets(response.NextToken);
          }
          return BbPromise.resolve();
        })
    );
};

const cleanupCFStacks = (token) => {
  const params = {
    StackStatusFilter: [
      'CREATE_FAILED',
      'CREATE_COMPLETE',
      'ROLLBACK_FAILED',
      'ROLLBACK_COMPLETE',
      'DELETE_FAILED',
      'UPDATE_ROLLBACK_FAILED',
      'UPDATE_ROLLBACK_COMPLETE',
    ],
  };

  if (token) {
    params.NextToken = token;
  }

  logger.log('Looking through stacks ...');
  return CF.listStacksPromised(params)
    .then(response =>
      response.StackSummaries.reduce((memo, stack) => {
        if (['DELETE_COMPLETE', 'DELETE_IN_PROGRESS'].indexOf(stack.StackStatus) === -1) {
          logger.log('Deleting stack', stack.StackName);
          return memo.then(() => CF.deleteStackPromised({ StackName: stack.StackName }));
        }
        return memo;
      }, BbPromise.resolve())
        .then(() => {
          if (response.NextToken) {
            return cleanupCFStacks(response.NextToken);
          }
          return BbPromise.resolve();
        })
  );
};

cleanupS3Buckets().then(cleanupCFStacks);
