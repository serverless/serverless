'use strict';

/**
 * JAWS Test: Deploy Lambda Command
 */
var testUtils = require('../test_utils'),
    path = require('path'),
    assert = require('chai').assert,
    JAWS = null;

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

    process.chdir(config.projectPath);

    JAWS = require('../../lib/index.js');
  });

  after(function(done) {
    done();
  });

  describe('Positive tests', function() {

    it('Multi level module deploy', function(done) {
      this.timeout(0);
      process.chdir(path.join(config.projectPath, 'back/lambdas/users/show'));

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
      process.chdir(path.join(config.projectPath, 'back/lambdas/bundle/browserify'));

      JAWS.deployLambdas(config.stage, false, false)
          .then(function(d) {
            done();
          })
          .error(function(e) {
            done(e);
          });
    });

    it('non optimized deploy', function(done) {
      this.timeout(0);
      process.chdir(path.join(config.projectPath, 'back/lambdas/bundle/nonoptimized'));

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