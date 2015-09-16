'use strict';

/**
 * JAWS Test: Install Command
 */

var Jaws = require('../../lib/index.js'),
    CmdInstall = require('../../lib/commands/install'),
    JawsError = require('../../lib/jaws-error'),
    testUtils = require('../test_utils'),
    path = require('path'),
    assert = require('chai').assert;

var config = require('../config'),
    projPath,
    JAWS;

describe('Test "install" command', function() {

  before(function() {
    projPath = testUtils.createTestProject(
        config.name,
        config.region,
        config.stage,
        config.iamRoleArnLambda,
        config.iamRoleArnApiGateway,
        config.envBucket);
    process.chdir(path.join(projPath, 'back', 'aws_modules', 'sessions', 'show'));
    JAWS = new Jaws();
  });

  after(function(done) {
    done();
  });

  describe('Positive tests', function() {
    it('Install module', function(done) {
      this.timeout(0);

      CmdInstall.install(JAWS, 'https://github.com/jaws-stack/jaws-users-crud-ddb-jwt-js')
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