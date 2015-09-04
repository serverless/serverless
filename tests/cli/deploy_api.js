'use strict';

/**
 * JAWS Test: Deploy API Command
 * - Copies the test-prj template to your system's temp directory
 * - Deploys an API based on the endpoints in the project
 */
var testUtils = require('../test_utils'),
    path = require('path'),
    assert = require('chai').assert;

var config = require('../config');

describe('Test deploy api command', function() {

  before(function() {
    config.projectPath = testUtils.createTestProject(
        config.name,
        config.region,
        config.stage,
        config.iamRoleARN,
        config.envBucket);
    process.chdir(path.join(config.projectPath,'back/lambdas/users/show'));
  });

  after(function(done) {
    done();
  });

  describe('Positive tests', function() {
    it('Deploy REST API', function(done) {

      this.timeout(0);

      // Require
      var JAWS = require('../../lib/index.js'),
          JawsError = require('../../lib/jaws-error');

      // Test
      JAWS.deployApi(config.stage)
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
});