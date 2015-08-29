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

// Define Test Data
var testData = {};
testData.name = 'test-prj';
testData.notifyEmail = 'tester@jawsstack.com';
testData.s3Bucket = process.env.TEST_JAWS_S3_BUCKET || 'jawstest6';
testData.stage = 'unittest';
testData.region = 'us-east-1';
testData.profile = 'default';

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
  require('./new'),
  require('./deploy/api'),
];

// Run Tests
async.eachSeries(tests, function(test, cb) {
    test(testData, function(testData) { return cb(); });
}, function(error) { console.log('Tests completed'); });