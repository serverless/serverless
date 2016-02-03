'use strict';

const path = require('path');

// Require ENV lets, can also set ENV lets in your IDE
require('dotenv').config({ path: path.join(__dirname, '.env'), silent: true });

let config = {
  notifyEmail:          process.env.TEST_SERVERLESS_EMAIL,
  region:               process.env.TEST_SERVERLESS_REGION1,
  region2:              process.env.TEST_SERVERLESS_REGION2,
  stage:                process.env.TEST_SERVERLESS_STAGE1,
  stage2:               process.env.TEST_SERVERLESS_STAGE2,
  noExecuteCf:          process.env.TEST_SERVERLESS_EXE_CF != "true",
  awsAdminKeyId:        process.env.TEST_SERVERLESS_AWS_ACCESS_KEY,
  awsAdminSecretKey:    process.env.TEST_SERVERLESS_AWS_SECRET_KEY,
  iamRoleArnLambda:     process.env.TEST_SERVERLESS_LAMBDA_ROLE,
  streamArn:            process.env.TEST_STREAM_ARN,
};

module.exports = config;
