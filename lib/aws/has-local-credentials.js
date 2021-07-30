'use strict';

const AWS = require('aws-sdk');

module.exports = () => {
  return Boolean(new AWS.S3().config.credentials);
};
