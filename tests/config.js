'use strict';

var path = require('path'),
    AWS = require('aws-sdk');

// Require ENV vars
require('dotenv').config({path: __dirname + '/.env'});

var config = {
  name: 'test-prj',
  notifyEmail: 'tester@jawsstack.com',
  stage: 'unittest',
  region: 'us-east-1',
  envBucket: process.env.TEST_JAWS_ENV_BUCKET,
  profile: process.env.TEST_JAWS_PROFILE,
  iamRoleARN: process.env.TEST_JAWS_IAM_ROLE,
};

AWS.config.credentials = new AWS.SharedIniFileCredentials({
  profile: config.profile,
});

AWS.config.update({
  region: config.region,
});

module.exports = config;