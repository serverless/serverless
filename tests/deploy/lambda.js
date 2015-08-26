'use strict';

var JAWS = require('../../lib/index.js'),
    JawsError = require('../../lib/jaws-error'),
    path = require('path'),
    AWSUtils = require('../../lib/utils/aws'),
    assert = require('chai').assert;

var projName = process.env.TEST_PROJECT_NAME,
    stage = 'unittest',
    lambdaRegion = 'us-east-1',
    notificationEmail = 'tester@jawsstack.com',
    awsProfile = 'default';

// Tests
describe('Test deployment', function() {

  it('Testing lambda', function(done) {
    this.timeout(0);

    AWSUtils.createBucket(awsProfile, lambdaRegion, 'awsbilling.reports');
  });
});

