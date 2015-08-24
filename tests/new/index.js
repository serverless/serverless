'use strict';

var JAWS = require('../../lib/index.js'),
    JawsError = require('../../lib/jaws-error');

var projName = process.env.TEST_PROJECT_NAME,
    stage = 'dev',
    lambdaRegion = 'us-east-1',
    notificationEmail = 'tester@jawsstack.com',
    awsProfile = 'default';

// Tests
describe('Test new command', function() {

  it('Existing aws creds', function(done) {
    this.timeout(0);

    JAWS.new(projName, stage, lambdaRegion, notificationEmail, awsProfile)
        .then(function() {
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
