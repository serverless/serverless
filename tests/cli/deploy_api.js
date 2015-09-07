'use strict';

/**
 * JAWS Test: Deploy API Command
 * - Copies the test-prj template to your system's temp directory
 * - Deploys an API based on the endpoints in the project
 */
var Jaws = require('../../lib/index.js'),
    theCmd = require('../../lib/commands/deploy_api'),
    JawsError = require('../../lib/jaws-error'),
    testUtils = require('../test_utils'),
    path = require('path'),
    assert = require('chai').assert,
    config = require('../config'),
    lambdaPaths = {},
    projPath,
    JAWS;

describe('Test deploy api command', function() {

  before(function() {
    projPath = testUtils.createTestProject(
        config.name,
        config.region,
        config.stage,
        config.iamRoleArnLambda,
        config.iamRoleArnApiG,
        config.envBucket);
    process.chdir(path.join(projPath, 'back/lambdas/users/show'));
    JAWS = new Jaws();

    // Get Lambda Paths
    lambdaPaths.lambda1 = path.join(projPath, 'back', 'lambdas', 'users', 'show', 'jaws.json');
    lambdaPaths.lambda2 = path.join(projPath, 'back', 'lambdas', 'users', 'signin', 'jaws.json');
    lambdaPaths.lambda3 = path.join(projPath, 'back', 'lambdas', 'users', 'signup', 'jaws.json');
  });

  after(function(done) {
    done();
  });

  describe('Positive tests', function() {
    it('Deploy REST API', function(done) {

      this.timeout(0);

      theCmd.deployApi(config.stage, config.region, true)
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

    it('Check API ID was added to project\'s jaws.json file', function(done) {

      // Get Region JSON
      var regions = require(path.join(projPath, 'jaws.json'))
          .project.stages[config.stage.toLowerCase().trim()];
      var region = null;
      for (var i = 0; i < regions.length; i++) {
        if (regions[i].region.toLowerCase().trim() === config.region.toLowerCase().trim()) {
          region = regions[i];
        }
      }

      assert.equal(true, typeof region !== 'undefined');
      assert.equal(true, typeof region.restApiId !== 'undefined');
      done();
    });
  });
});