'use strict';

/**
 * JAWS Test: Dash Command
 */

var Jaws = require('../../lib/index.js'),
    theCmd = require('../../lib/commands/dash'),
    JawsError = require('../../lib/jaws-error'),
    testUtils = require('../test_utils'),
    path = require('path'),
    assert = require('chai').assert;

var config = require('../config'),
    projPath,
    JAWS;

describe('Test "dash" command', function() {

  before(function() {
    projPath = testUtils.createTestProject(
        config.name,
        config.region,
        config.stage,
        config.iamRoleArnLambda,
        config.iamRoleArnApiGateway,
        config.envBucket);
    process.chdir(path.join(projPath, 'back', 'lambdas', 'users', 'show'));
    JAWS = new Jaws();
  });

  after(function(done) {
    done();
  });

  describe('Positive tests', function() {
    it('Show Dash', function(done) {
      this.timeout(0);

      theCmd.run(JAWS, config.stage, config.region)
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