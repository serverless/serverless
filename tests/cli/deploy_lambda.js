'use strict';

/**
 * JAWS Test: Deploy Lambda Command
 */
var testUtils = require('../test_utils'),
    path = require('path'),
    assert = require('chai').assert,
    JAWS = null;

var config = require('../config'),
    projPath;

describe('Test "deploy lambda" command', function() {

  before(function() {
    projPath = testUtils.createTestProject(
        config.name,
        config.region,
        config.stage,
        config.lambdaDeployIamRoleArn,
        config.envBucket,
        ['back']);

    process.chdir(projPath);
  });

  after(function(done) {
    done();
  });

  describe('Positive tests', function() {

    it('Multi level module deploy', function(done) {
      this.timeout(0);

      JAWS = require('../../lib/index.js');

      process.chdir(path.join(projPath, 'back/lambdas/users/show'));

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
      process.chdir(path.join(projPath, 'back/lambdas/bundle/browserify'));

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
      process.chdir(path.join(projPath, 'back/lambdas/bundle/nonoptimized'));

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