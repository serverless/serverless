'use strict';

const awsRequest = require('@serverless/test/aws-request');
const S3Service = require('aws-sdk').S3;

async function createBucket(bucket) {
  return awsRequest(S3Service, 'createBucket', { Bucket: bucket });
}

async function createAndRemoveInBucket(bucket, opts = {}) {
  const prefix = opts.prefix || '';
  const suffix = opts.suffix || '';
  const fileName = opts.fileName || 'object';

  const params = {
    Bucket: bucket,
    Key: `${prefix}${fileName}${suffix}`,
    Body: 'hello world',
  };

  return awsRequest(S3Service, 'putObject', params).then(() => {
    delete params.Body;
    return awsRequest(S3Service, 'deleteObject', params);
  });
}

async function emptyBucket(bucket) {
  return awsRequest(S3Service, 'listObjects', { Bucket: bucket }).then((data) => {
    const items = data.Contents;
    const numItems = items.length;
    if (numItems) {
      const keys = items.map((item) => Object.assign({}, { Key: item.Key }));
      return awsRequest(S3Service, 'deleteObjects', {
        Bucket: bucket,
        Delete: {
          Objects: keys,
        },
      });
    }
    return null;
  });
}

async function deleteBucket(bucket) {
  return emptyBucket(bucket).then(() => awsRequest(S3Service, 'deleteBucket', { Bucket: bucket }));
}

module.exports = {
  createBucket,
  createAndRemoveInBucket,
  emptyBucket,
  deleteBucket,
};
