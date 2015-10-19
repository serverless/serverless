'use strict';

/**
 * JAWS Test: Deploy API Command
 * - Copies the test-prj template to your system's temp directory
 * - Deploys an API based on the endpoints in the project
 */
let Jaws = require('../../lib/index.js'),
    Tag = require('../../lib/commands/Tag'),
    testUtils = require('../test_utils'),
    path = require('path'),
    assert = require('chai').assert,
    Promise = require('bluebird');

let config = require('../config'),
    projPath,
    modulePaths = {},
    JAWS;

describe('Test "tag" command', function() {

  before(function(done) {
    testUtils.createTestProject(
        config.name,
        config.stage,
        config.region,
        config.domain,
        config.iamRoleArnLambda,
        config.iamRoleArnApiGateway)
        .then(function(pp) {
          projPath = pp;
          process.chdir(projPath);
          JAWS = new Jaws();

          // Get Lambda Paths
          modulePaths.lambda1 = path.join(projPath, 'aws_modules', 'sessions', 'show', 'awsm.json');
          modulePaths.lambda2 = path.join(projPath, 'aws_modules', 'sessions', 'create', 'awsm.json');
          modulePaths.lambda3 = path.join(projPath, 'aws_modules', 'users', 'create', 'awsm.json');
          done();
        });
  });

  after(function(done) {
    done();
  });

  describe('Positive tests', function() {
    it('tag lambdas', function(done) {

      this.timeout(0);

      Tag.tag('lambda', modulePaths.lambda1, false)
          .then(function() {
            assert.equal(true, require(modulePaths.lambda1).lambda.deploy);
            assert.equal(false, require(modulePaths.lambda2).lambda.deploy);
            assert.equal(false, require(modulePaths.lambda3).lambda.deploy);
            let CmdTag = new Tag(JAWS, 'lambda');
            return CmdTag.tagAll(false);
          })
          .then(function() {
            assert.equal(true, require(modulePaths.lambda1).lambda.deploy);
            assert.equal(true, require(modulePaths.lambda2).lambda.deploy);
            assert.equal(true, require(modulePaths.lambda3).lambda.deploy);
            let CmdTag = new Tag(JAWS, 'lambda');
            return CmdTag.tagAll(true);
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

      Tag.tag('endpoint', modulePaths.lambda1, false)
          .then(function() {
            assert.equal(true, require(modulePaths.lambda1).apiGateway.deploy);
            assert.equal(false, require(modulePaths.lambda2).apiGateway.deploy);
            assert.equal(false, require(modulePaths.lambda3).apiGateway.deploy);
            let CmdTag = new Tag(JAWS, 'endpoint');
            return CmdTag.tagAll(false);
          })
          .then(function() {
            assert.equal(true, require(modulePaths.lambda1).apiGateway.deploy);
            assert.equal(true, require(modulePaths.lambda2).apiGateway.deploy);
            assert.equal(true, require(modulePaths.lambda3).apiGateway.deploy);
            let CmdTag = new Tag(JAWS, 'endpoint');
            return CmdTag.tagAll(true);
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
  });
});
