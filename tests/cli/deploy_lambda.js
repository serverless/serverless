'use strict';

/**
 * JAWS Test: Deploy Lambda Command
 */
var testUtils = require('../test_utils'),
    path = require('path'),
    assert = require('chai').assert;

var config = require('../config');

describe('Test "deploy lambda" command', function() {

  before(function() {
    config.projectPath = testUtils.createTestProject(
        config.name,
        config.region,
        config.stage,
        config.lambdaDeployIamRoleArn,
        config.envBucket,
        ['back']);
  });

  after(function(done) {
    done();
  });

  describe('Positive tests', function() {

    it('Multi level module deploy', function(done) {
      this.timeout(0);
      process.chdir(path.join(config.projectPath, 'back/lambdas/users/show'));

      // Require
      var JAWS = require('../../lib/index.js');

      // Test
      JAWS.deployLambdas(config.stage, false, false)
          .then(function(d) {
            done();
          })
          .error(function(e) {
            done(e);
          });
    });

    it('browserify deploy', function(done) {
      this.timeout(0);
      process.chdir(path.join(config.projectPath, 'back/lambdas/browserify/tests'));

      // Require
      var JAWS = require('../../lib/index.js');

      // Test
      JAWS.deployLambdas(config.stage, false, false)
          .then(function(d) {
            done();
          })
          .error(function(e) {
            done(e);
          });
    });

  });
});