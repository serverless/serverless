'use strict';

/**
 * JAWS: Spot Tests
 * @type {async|exports|module.exports}
 */
var async = require('async'),
    os = require('os'),
    path = require('path'),
    AWS = require('aws-sdk'),
    shortid = require('shortid');

// Require ENV vars
require('dotenv').load();

// Define Test Data
var testData = {};
testData.name = 'test-prj';
testData.notifyEmail = 'tester@jawsstack.com';
testData.stage = 'unittest';
testData.region = 'us-east-1';
testData.envBucket = process.env.TEST_JAWS_ENV_BUCKET;
testData.profile = process.env.TEST_JAWS_PROFILE || 'default';
testData.iamRoleARN = process.env.TEST_JAWS_IAM_ROLE;

// Add aws-sdk to Test Data Object (helps clean up test resources, etc.)
testData.AWS = require('aws-sdk');
testData.AWS.config.credentials = new testData.AWS.SharedIniFileCredentials({
  profile: testData.profile,
});
testData.AWS.config.update({
  region: testData.region,
});

// Require Tests
var tests = [
  require('./tests/tag'),
  require('./tests/deploy_lambda'),
  //require('./tests/deploy_api'),
  //require('./tests/new'), // Must be last
];

// Run Tests
async.eachSeries(tests, function(test, cb) {
  test(testData, function(testData) { return cb(); });
}, function(error) { console.log('Tests completed'); });