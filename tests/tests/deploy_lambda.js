'use strict';

/**
 * JAWS Test: Deploy Lambda Command
 */
let Jaws = require('../../lib/index.js'),
    CmdDeployLambda = require('../../lib/commands/DeployLambda'),
    Tag = require('../../lib/commands/Tag'),
    testUtils = require('../test_utils'),
    path = require('path'),
    Promise = require('bluebird'),
    assert = require('chai').assert,
    JAWS;

let config = require('../config'),
    projPath;

describe('Test "deploy lambda" command', function() {
  this.timeout(0);  //dont timeout anything

  before(function(done) {
    this.timeout(0);  //dont timeout anything

    testUtils.createTestProject(
        config.name,
        config.stage,
        config.region,
        config.domain,
        config.iamRoleArnLambda,
        config.iamRoleArnApiG,
        ['./'])
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

      process.chdir(path.join(projPath, 'aws_modules/sessions/show'));

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
      process.chdir(path.join(projPath, 'aws_modules/bundle/browserify'));

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
      process.chdir(path.join(projPath, 'aws_modules/bundle/nonoptimized'));

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
      let bundleDirPath = path.join(projPath, 'aws_modules/bundle');

      process.chdir(bundleDirPath);

      Promise.all([
            Tag.tag('lambda', bundleDirPath + '/browserify/awsm.json'),
            Tag.tag('lambda', bundleDirPath + '/nonoptimized/awsm.json'),
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