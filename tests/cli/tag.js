'use strict';

/**
 * JAWS Test: Deploy API Command
 * - Copies the test-prj template to your system's temp directory
 * - Deploys an API based on the endpoints in the project
 */
var Jaws = require('../../lib/index.js'),
    CmdTag = require('../../lib/commands/tag'),
    testUtils = require('../test_utils'),
    path = require('path'),
    assert = require('chai').assert,
    Promise = require('bluebird');

var config = require('../config'),
    projPath,
    modulePaths = {},
    JAWS;

describe('Test "tag" command', function() {

  before(function(done) {
    testUtils.createTestProject(
            config.name,
            config.usEast1Bucket,
            config.stage,
            config.iamRoleArnLambda,
            config.iamRoleArnApiGateway,
            config.envBucket)
        .then(function(pp) {
          projPath = pp;
          process.chdir(projPath);
          JAWS = new Jaws();

          // Get Lambda Paths
          modulePaths.lambda1 = path.join(projPath, 'back', 'aws_modules', 'sessions', 'show', 'awsm.json');
          modulePaths.lambda2 = path.join(projPath, 'back', 'aws_modules', 'sessions', 'create', 'awsm.json');
          modulePaths.lambda3 = path.join(projPath, 'back', 'aws_modules', 'users', 'create', 'awsm.json');
          done();
        });
  });

  after(function(done) {
    done();
  });

  describe('Positive tests', function() {
    it('tag lambdas', function(done) {

      this.timeout(0);

      CmdTag.tag('lambda', modulePaths.lambda1, false)
          .then(function() {
            assert.equal(true, require(modulePaths.lambda1).lambda.deploy);
            assert.equal(false, require(modulePaths.lambda2).lambda.deploy);
            assert.equal(false, require(modulePaths.lambda3).lambda.deploy);
            return CmdTag.tagAll(JAWS, 'lambda', false);
          })
          .then(function() {
            assert.equal(true, require(modulePaths.lambda1).lambda.deploy);
            assert.equal(true, require(modulePaths.lambda2).lambda.deploy);
            assert.equal(true, require(modulePaths.lambda3).lambda.deploy);
            return CmdTag.tagAll(JAWS, 'lambda', true);
          })
          .then(function() {
            assert.equal(false, require(modulePaths.lambda1).lambda.deploy);
            assert.equal(false, require(modulePaths.lambda2).lambda.deploy);
            assert.equal(false, require(modulePaths.lambda3).lambda.deploy);
            done();
          })
          .error(function(e) {
            done(e);
          });
    });

    it('tag endpoints', function(done) {
      this.timeout(0);

      CmdTag.tag('endpoint', modulePaths.lambda1, false)
          .then(function() {
            assert.equal(true, require(modulePaths.lambda1).apiGateway.deploy);
            assert.equal(false, require(modulePaths.lambda2).apiGateway.deploy);
            assert.equal(false, require(modulePaths.lambda3).apiGateway.deploy);
            return CmdTag.tagAll(JAWS, 'endpoint', false);
          })
          .then(function() {
            assert.equal(true, require(modulePaths.lambda1).apiGateway.deploy);
            assert.equal(true, require(modulePaths.lambda2).apiGateway.deploy);
            assert.equal(true, require(modulePaths.lambda3).apiGateway.deploy);
            return CmdTag.tagAll(JAWS, 'endpoint', true);
          })
          .then(function() {
            assert.equal(false, require(modulePaths.lambda1).apiGateway.deploy);
            assert.equal(false, require(modulePaths.lambda2).apiGateway.deploy);
            assert.equal(false, require(modulePaths.lambda3).apiGateway.deploy);
            done();
          })
          .error(function(e) {
            done(e);
          });
    });

    it('tag all', function(done) {
      this.timeout(0);

      CmdTag.tag('all', modulePaths.lambda1, false)
          .then(function() {
            assert.equal(true, require(modulePaths.lambda1).lambda.deploy);
            assert.equal(true, require(modulePaths.lambda1).apiGateway.deploy);
            assert.equal(false, require(modulePaths.lambda2).lambda.deploy);
            assert.equal(false, require(modulePaths.lambda2).apiGateway.deploy);
            assert.equal(false, require(modulePaths.lambda3).lambda.deploy);
            assert.equal(false, require(modulePaths.lambda3).apiGateway.deploy);
            return CmdTag.tagAll(JAWS, 'all', false);
          })
          .then(function() {
            assert.equal(true, require(modulePaths.lambda1).lambda.deploy);
            assert.equal(true, require(modulePaths.lambda1).apiGateway.deploy);
            assert.equal(true, require(modulePaths.lambda2).lambda.deploy);
            assert.equal(true, require(modulePaths.lambda2).apiGateway.deploy);
            assert.equal(true, require(modulePaths.lambda3).lambda.deploy);
            assert.equal(true, require(modulePaths.lambda3).apiGateway.deploy);
            return CmdTag.tagAll(JAWS, 'all', true);
          })
          .then(function() {
            assert.equal(false, require(modulePaths.lambda1).lambda.deploy);
            assert.equal(false, require(modulePaths.lambda1).apiGateway.deploy);
            assert.equal(false, require(modulePaths.lambda2).lambda.deploy);
            assert.equal(false, require(modulePaths.lambda2).apiGateway.deploy);
            assert.equal(false, require(modulePaths.lambda3).lambda.deploy);
            assert.equal(false, require(modulePaths.lambda3).apiGateway.deploy);
            done();
          })
          .error(function(e) {
            done(e);
          });
    });

  });
});
