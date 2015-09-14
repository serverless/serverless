'use strict';

/**
 * JAWS Test: Deploy Lambda Command
 */
var Jaws = require('../../lib/index.js'),
    CmdDeployLambda = require('../../lib/commands/deploy_lambda'),
    testUtils = require('../test_utils'),
    path = require('path'),
    assert = require('chai').assert,
    JAWS;

var config = require('../config'),
    projPath;

describe('Test "deploy lambda" command', function() {
  this.timeout(0);  //dont timeout anything

  before(function(done) {
    this.timeout(0);  //dont timeout anything

    projPath = testUtils.createTestProject(
        config.name,
        config.region,
        config.stage,
        config.iamRoleArnLambda,
        config.iamRoleArnApiGateway,
        config.envBucket,
        ['back']);

    process.chdir(projPath);
    JAWS = new Jaws();
    done();
  });

  describe('Positive tests', function() {

    it('Multi level module deploy', function(done) {
      this.timeout(0);

      process.chdir(path.join(projPath, 'back/lambdas/sessions/show'));

      CmdDeployLambda.run(JAWS, config.stage, [config.region], false)
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

      CmdDeployLambda.run(JAWS, config.stage, [config.region], false)
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

      CmdDeployLambda.run(JAWS, config.stage, [config.region], false)
          .then(function(d) {
            done();
          })
          .error(function(e) {
            done(e);
          });
    });
  });
});