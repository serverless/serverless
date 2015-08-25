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

    JAWS.new(projName, stage, lambdaRegion, notificationEmail, awsProfile)
        .then(function() {
          var jawsJson = require(process.env.TEST_PROJECT_DIR + '/' + process.env.TEST_PROJECT_NAME + '/jaws.json');
          assert.equal(jawsJson['us-east-1'].stages[0].stage, stage);
          assert.isTrue(!!jawsJson['us-east-1'].stages[0].iamRoleArn);
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
