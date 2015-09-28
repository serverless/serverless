'use strict';

/**
 * JAWS Test: Install Command
 */

var Jaws = require('../../lib/index.js'),
    CmdModule = require('../../lib/commands/module_install'),
    JawsError = require('../../lib/jaws-error'),
    testUtils = require('../test_utils'),
    path = require('path'),
    fs = require('fs'),
    rimraf = require('rimraf'),
    assert = require('chai').assert;

var config = require('../config'),
    projPath,
    JAWS;

describe('Test "install" command', function() {

  before(function(done) {
    testUtils.createTestProject(
            config.name,
            config.region,
            config.stage,
            config.iamRoleArnLambda,
            config.iamRoleArnApiGateway,
            config.usEast1Bucket)
        .then(function(pp) {
          projPath = pp;
          process.chdir(path.join(projPath, 'aws_modules', 'sessions', 'show'));

          // Delete jaws-core-js temporarily
          rimraf.sync(path.join(projPath, 'aws_modules', 'jaws-core-js'));

          JAWS = new Jaws();
          done();
        });
  });

  after(function(done) {
    done();
  });

  describe('Positive tests', function() {
    it('Install module', function(done) {
      this.timeout(0);

      CmdModule.install(JAWS, 'https://github.com/jaws-framework/jaws-core-js', true)
          .then(function() {

            // Run asserts on this when we have more aws-modules to test against
            var resourcesCF = require(path.join(
                projPath,
                'cloudformation',
                config.stage,
                config.region,
                'resources-cf.json'));

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