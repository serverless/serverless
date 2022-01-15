'use strict';

const AWS = require('@aws-sdk/client-s3');

module.exports = async () => {
  return new AWS.S3({}).config.credentials().then(
    () => true,
    () => false
  );
};
