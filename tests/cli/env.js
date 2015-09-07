'use strict';

/**
 * JAWS Test: ENV Command
 */

var Jaws = require('../../lib/index.js'),
    theCmd = require('../../lib/commands/env'),
    testUtils = require('../test_utils'),
    path = require('path'),
    assert = require('chai').assert;

var config = require('../config'),
    projPath,
    JAWS;

describe('Test "env" command', function() {

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
    it('Test env command', function(done) {
      this.timeout(0);

      theCmd.listEnv(JAWS, config.stage)
          .then(function(d) {
            done();
          })
          .error(function(e) {
            done(e);
          });
    });
  });
});