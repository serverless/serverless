'use strict';

const awsRequest = require('@serverless/test/aws-request');

function createBucket(bucket) {
  return awsRequest('S3', 'createBucket', { Bucket: bucket });
}

function createAndRemoveInBucket(bucket, opts = {}) {
  const prefix = opts.prefix || '';
  const suffix = opts.suffix || '';
  const fileName = opts.fileName || 'object';

  const params = {
    Bucket: bucket,
    Key: `${prefix}${fileName}${suffix}`,
    Body: 'hello world',
  };

  return awsRequest('S3', 'putObject', params).then(() => {
    delete params.Body;
    return awsRequest('S3', 'deleteObject', params);
  });
}

function emptyBucket(bucket) {
  return awsRequest('S3', 'listObjects', { Bucket: bucket }).then(data => {
    const items = data.Contents;
    const numItems = items.length;
    if (numItems) {
      const keys = items.map(item => Object.assign({}, { Key: item.Key }));
      return awsRequest('S3', 'deleteObjects', {
        Bucket: bucket,
        Delete: {
          Objects: keys,
        },
      });
    }
    return null;
  });
}

function deleteBucket(bucket) {
  return emptyBucket(bucket).then(() => awsRequest('S3', 'deleteBucket', { Bucket: bucket }));
}

module.exports = {
  createBucket,
  createAndRemoveInBucket,
  emptyBucket,
  deleteBucket,
};
