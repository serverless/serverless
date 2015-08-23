'use strict';

var JAWS = require('../../lib/index.js'),
  JawsError = require('../../lib/jaws-error');

// Seed Test Data
process.env.TEST_NEW_ANSWERS = JSON.stringify({
  name: process.env.TEST_PROJECT,
  stage: 'dev',
  region: 'us-east-1',
  notificationEmail: 'tester@jawsstack.com',
  awsCliProfile: 'default'
});

// Tests
describe('Test new command', function() {

  it('Existing aws creds', function(done) {
    this.timeout(0);

    JAWS.new()
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
