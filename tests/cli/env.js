'use strict';

/**
 * JAWS Test: ENV Command
 */

var Jaws = require('../../lib/index.js'),
    CmdEnv = require('../../lib/commands/env'),
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
        config.regionBucket);
    process.chdir(path.join(projPath, 'back', 'aws_modules', 'sessions', 'show'));
    JAWS = new Jaws();
  });

  after(function(done) {
    done();
  });

  describe('Positive tests', function() {
    it('Test env command', function(done) {
      this.timeout(0);

      CmdEnv.listEnv(JAWS, config.stage)
          .then(function(d) {
            done();
          })
          .error(function(e) {
            done(e);
          });
    });
  });
});