'use strict';

var JAWS = require('../../lib/index.js'),
    JawsError = require('../../lib/jaws-error'),
    path = require('path'),
    assert = require('chai').assert;

var projName = process.env.TEST_PROJECT_NAME,
    stage = 'unittest',
    lambdaRegion = 'us-east-1',
    notificationEmail = 'tester@jawsstack.com',
    awsProfile = 'default';

// Tests
describe('Test new command', function() {

  it('Existing aws creds', function(done) {
    this.timeout(0);

    JAWS.new(projName, stage, process.env.TEST_JAWS_S3_BUCKET, lambdaRegion, notificationEmail, awsProfile)
        .then(function() {
          var jawsJson = require(process.env.TEST_PROJECT_DIR + '/' + process.env.TEST_PROJECT_NAME + '/jaws.json');
          assert.isTrue(!!jawsJson.project.regions['us-east-1'].stages[stage].iamRoleArn);
          done();
        })
        .catch(JawsError, function(e) {
          done(e);
        })
        .error(function(e) {
          done(e);
        });
  });
});
