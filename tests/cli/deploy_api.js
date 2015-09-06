'use strict';

/**
 * JAWS Test: Deploy API Command
 * - Copies the test-prj template to your system's temp directory
 * - Deploys an API based on the endpoints in the project
 */
var testUtils = require('../test_utils'),
    path = require('path'),
    assert = require('chai').assert,
    config = require('../config'),
    lambdaPaths = {};

describe('Test deploy api command', function() {

  before(function() {
    config.projectPath = testUtils.createTestProject(
        config.name,
        config.region,
        config.stage,
        config.iamRoleARN,
        config.envBucket);
    process.chdir(path.join(config.projectPath,'back/lambdas/users/show'));

    // Get Lambda Paths
    lambdaPaths.lambda1 = path.join(config.projectPath, 'back', 'lambdas', 'users', 'show', 'jaws.json');
    lambdaPaths.lambda2 = path.join(config.projectPath, 'back', 'lambdas', 'users', 'signin', 'jaws.json');
    lambdaPaths.lambda3 = path.join(config.projectPath, 'back', 'lambdas', 'users', 'signup', 'jaws.json');
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
      JAWS.deployApi(config.stage, config.region, true)
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

    it('Check jaws.json files were untagged', function(done) {
      assert.equal(false, require(lambdaPaths.lambda1).endpoint.deploy);
      assert.equal(false, require(lambdaPaths.lambda2).endpoint.deploy);
      assert.equal(false, require(lambdaPaths.lambda3).endpoint.deploy);
      done();
    });
  });
});