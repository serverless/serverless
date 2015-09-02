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
  region: 'us-east-1',
  envBucket: process.env.TEST_JAWS_ENV_BUCKET,
  profile: process.env.TEST_JAWS_PROFILE,
  iamRoleARN: process.env.TEST_JAWS_IAM_ROLE, //must manually create in IAM UI, TODO: create CF that creates this user
  lambdaDeployIamRoleArn: process.env.TEST_JAWS_LAMBDA_DEPLOY_IAM_ROLE,
};

AWS.config.credentials = new AWS.SharedIniFileCredentials({
  profile: config.profile,
});

AWS.config.update({
  region: config.region,
});

module.exports = config;
