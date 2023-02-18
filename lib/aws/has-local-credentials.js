'use strict';

const {
  S3
} = require("@aws-sdk/client-s3");

module.exports = () => {
  return Boolean(new S3().config.credentials);
};
