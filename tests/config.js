'use strict';

var path = require('path'),
    AWS = require('aws-sdk');

// Require ENV vars, can also set ENV vars in your IDE
require('dotenv').config({path: path.join(__dirname, '.env'), silent: true});

process.env.JAWS_VERBOSE = true;

var config = {
  name: 'test-prj',
  domain: 'test.jawsapp.com',
  notifyEmail: 'tester@jawsstack.com',
  stage: 'unittest',
  region: process.env.TEST_JAWS_REGION || 'us-east-1',
  usEast1Bucket: process.env.TEST_JAWS_US_EAST_1_BUCKET,
  euWest1Bucket: process.env.TEST_JAWS_EU_WEST_1_BUCKET,
  profile: process.env.TEST_JAWS_PROFILE,
  iamRoleArnApiGateway: process.env.TEST_JAWS_APIGATEWAY_ROLE,
  iamRoleArnLambda: process.env.TEST_JAWS_LAMBDA_ROLE,
  noExecuteCf: (process.env.TEST_JAWS_NO_EXE_CF != "false")
};

AWS.config.credentials = new AWS.SharedIniFileCredentials({
  profile: config.profile,
});

AWS.config.update({
  region: config.region,
});

module.exports = config;
