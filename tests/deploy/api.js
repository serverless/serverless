'use strict';

var JAWS = require('../../lib/index.js'),
    JawsError = require('../../lib/jaws-error');

var projName = process.env.TEST_PROJECT_NAME,
    stage = 'dev',
    lambdaRegion = 'us-east-1',
    notificationEmail = 'tester@jawsstack.com',
    awsProfile = 'default';

// Tests
describe('Test deploy api command', function() {

  it('deploy api', function(done) {
    this.timeout(0);

    JAWS.deployApi('dev')
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
