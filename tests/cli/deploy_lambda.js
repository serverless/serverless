'use strict';

/**
 * JAWS Test: Deploy Lambda Command
 */
var Jaws = require('../../lib/index.js'),
    CmdDeployLambda = require('../../lib/commands/deploy_lambda'),
    CmdTag = require('../../lib/commands/tag'),
    testUtils = require('../test_utils'),
    path = require('path'),
    Promise = require('bluebird'),
    assert = require('chai').assert,
    JAWS;

var config = require('../config'),
    projPath;

describe('Test "deploy lambda" command', function() {
  this.timeout(0);  //dont timeout anything

  before(function(done) {
    this.timeout(0);  //dont timeout anything

    testUtils.createTestProject(
            config.name,
            config.region,
            config.stage,
            config.iamRoleArnLambda,
            config.iamRoleArnApiGateway,
            config.usEast1Bucket,
            ['back/aws_modules/jaws-core-js',
              'back/aws_modules/bundle',
            ])
        .then(function(pp) {
          projPath = pp;
          process.chdir(projPath);
          JAWS = new Jaws();
          done();
        });
  });

  describe('Positive tests', function() {

    it('Multi level module deploy', function(done) {
      this.timeout(0);

      process.chdir(path.join(projPath, 'back/aws_modules/sessions/show'));

      CmdDeployLambda.run(JAWS, config.stage, [config.region], false, config.noExecuteCf)
          .then(function(d) {
            done();
          })
          .error(function(e) {
            done(e);
          });
    });

    it('browserify deploy', function(done) {
      this.timeout(0);
      process.chdir(path.join(projPath, 'back/aws_modules/bundle/browserify'));

      CmdDeployLambda.run(JAWS, config.stage, [config.region], false, config.noExecuteCf)
          .then(function(d) {
            done();
          })
          .error(function(e) {
            done(e);
          });
    });

    it('non optimized deploy', function(done) {
      this.timeout(0);
      process.chdir(path.join(projPath, 'back/aws_modules/bundle/nonoptimized'));

      CmdDeployLambda.run(JAWS, config.stage, [config.region], false, config.noExecuteCf)
          .then(function(d) {
            done();
          })
          .error(function(e) {
            done(e);
          });
    });

    it('deploy multiple', function(done) {
      this.timeout(0);
      var bundleDirPath = path.join(projPath, 'back/aws_modules/bundle');

      process.chdir(bundleDirPath);

      Promise.all([
            CmdTag.tag('lambda', bundleDirPath + '/browserify/awsm.json'),
            CmdTag.tag('lambda', bundleDirPath + '/nonoptimized/awsm.json'),
          ])
          .then(function() {
            return CmdDeployLambda.run(JAWS, config.stage, [config.region], true, config.noExecuteCf)
          })
          .then(function(d) {
            done();
          })
          .error(function(e) {
            done(e);
          });
    });
  });
});