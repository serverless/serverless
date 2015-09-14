'use strict';

/**
 * JAWS Test: New Action Command
 */

var Jaws = require('../../lib/index.js'),
    CmdNewAction = require('../../lib/commands/new_action'),
    JawsError = require('../../lib/jaws-error'),
    testUtils = require('../test_utils'),
    Promise = require('bluebird'),
    path = require('path'),
    assert = require('chai').assert;

var config = require('../config'),
    projPath,
    JAWS;

describe('Test "new action" command', function() {

  before(function(done) {
    this.timeout(0);

    // Tag All Lambdas & Endpoints
    return Promise.try(function() {

      // Create Test Project
      projPath = testUtils.createTestProject(
          config.name,
          config.region,
          config.stage,
          config.iamRoleArnLambda,
          config.iamRoleArnApiGateway,
          config.envBucket);
      process.chdir(path.join(projPath, 'back'));

      // Instantiate JAWS
      JAWS = new Jaws();
    }).then(done);
  });

  describe('Positive tests', function() {

    it('Test "new action" command', function(done) {
      this.timeout(0);

      var action = {
        type: 'both',
        resource: 'users',
        action: 'list',
      };

      CmdNewAction.run(JAWS, action)
          .then(function() {
            var jawsJson = require(path.join(process.cwd(), 'lambdas/users/list/jaws.json'));
            assert.isTrue(typeof jawsJson.lambda !== 'undefined');
            assert.isTrue(typeof jawsJson.endpoint !== 'undefined');
            assert.isTrue(jawsJson.lambda.functionName === 'users-list');
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