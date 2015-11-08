'use strict';

const path = require('path'),
      AWS  = require('aws-sdk');

// Require ENV lets, can also set ENV lets in your IDE
require('dotenv').config({path: path.join(__dirname, '.env'), silent: true});

process.env.DEBUG = '*';

let config = {
  name:                 'test-prj',
  domain:               process.env.TEST_JAWS_DOMAIN,
  notifyEmail:          'tester@jawsstack.com',
  stage:                'unittest',
  region:               'us-east-1',
  stage2:               'unittest2',
  region2:              'us-west-2',
  //Set following 2, to an existing unit test project's ARNS, for test cases that need to interact w/ proj aws resources
  //You can simply make a unittest project via `jaws project create` then set the env vars from the values in `project.json`
  iamRoleArnApiGateway: process.env.TEST_JAWS_APIGATEWAY_ROLE,
  iamRoleArnLambda:     process.env.TEST_JAWS_LAMBDA_ROLE,
  noExecuteCf:          process.env.TEST_JAWS_EXE_CF != "true",
  awsAdminKeyId:        process.env.TEST_JAWS_AWS_ACCESS_KEY,
  awsAdminSecretKey:    process.env.TEST_JAWS_AWS_SECRET_KEY,
};

AWS.config.credentials = new AWS.SharedIniFileCredentials({
  profile: config.profile,
});

AWS.config.update({
  region: config.region,
});

module.exports = config;
