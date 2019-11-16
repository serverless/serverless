'use strict';

const AWS = require('aws-sdk');
const { region, persistentRequest } = require('../misc');

function createBucket(bucket) {
  const S3 = new AWS.S3({ region });

  return S3.createBucket({ Bucket: bucket }).promise();
}

function createAndRemoveInBucket(bucket, opts = {}) {
  const S3 = new AWS.S3({ region });

  const prefix = opts.prefix || '';
  const suffix = opts.suffix || '';
  const fileName = opts.fileName || 'object';

  const params = {
    Bucket: bucket,
    Key: `${prefix}${fileName}${suffix}`,
    Body: 'hello world',
  };

  return S3.putObject(params)
    .promise()
    .then(() => {
      delete params.Body;
      return S3.deleteObject(params).promise();
    });
}

function emptyBucket(bucket) {
  const S3 = new AWS.S3({ region });

  return S3.listObjects({ Bucket: bucket })
    .promise()
    .then(data => {
      const items = data.Contents;
      const numItems = items.length;
      if (numItems) {
        const keys = items.map(item => Object.assign({}, { Key: item.Key }));
        return S3.deleteObjects({
          Bucket: bucket,
          Delete: {
            Objects: keys,
          },
        }).promise();
      }
      return null;
    });
}

function deleteBucket(bucket) {
  const S3 = new AWS.S3({ region });

  return emptyBucket(bucket).then(() => S3.deleteBucket({ Bucket: bucket }).promise());
}

module.exports = {
  createBucket: persistentRequest.bind(this, createBucket),
  createAndRemoveInBucket: persistentRequest.bind(this, createAndRemoveInBucket),
  emptyBucket: persistentRequest.bind(this, emptyBucket),
  deleteBucket: persistentRequest.bind(this, deleteBucket),
};
