'use strict';

var path = require('path'),
    AWS = require('aws-sdk');

// Require ENV vars, can also set ENV vars in your IDE
require('dotenv').config({path: path.join(__dirname, '.env'), silent: true});

process.env.JAWS_VERBOSE = true;

var config = {
  name: 'test-prj',
  notifyEmail: 'tester@jawsstack.com',
  stage: 'unittest',
  regions: ['us-east-1'],
  envBucket: process.env.TEST_JAWS_ENV_BUCKET,
  profile: process.env.TEST_JAWS_PROFILE,
  iamRoleArnApiGateway: process.env.TEST_JAWS_APIGATEWAY_ROLE,
  iamRoleArnLambda: process.env.TEST_JAWS_LAMBDA_ROLE,
};

AWS.config.credentials = new AWS.SharedIniFileCredentials({
  profile: config.profile,
});

AWS.config.update({
  region: config.region,
});

module.exports = config;
