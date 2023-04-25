'use strict';

const AWS = require('./sdk-v2');

module.exports = () => {
  return Boolean(new AWS.S3().config.credentials);
};
