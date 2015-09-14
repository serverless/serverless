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
    lambdaPaths = {},
    JAWS;

describe('Test "tag" command', function() {

  before(function(done) {
    projPath = testUtils.createTestProject(
        config.name,
        config.region,
        config.stage,
        config.iamRoleArnLambda,
        config.iamRoleArnApiGateway,
        config.envBucket);

    process.chdir(projPath);
    JAWS = new Jaws();

    // Get Lambda Paths
    lambdaPaths.lambda1 = path.join(projPath, 'back', 'lambdas', 'sessions', 'show', 'jaws.json');
    lambdaPaths.lambda2 = path.join(projPath, 'back', 'lambdas', 'sessions', 'create', 'jaws.json');
    lambdaPaths.lambda3 = path.join(projPath, 'back', 'lambdas', 'users', 'create', 'jaws.json');
    done();
  });

  after(function(done) {
    done();
  });

  describe('Positive tests', function() {
    it('tag lambdas', function(done) {

      this.timeout(0);

      CmdTag.tag('lambda', lambdaPaths.lambda1, false)
          .then(function() {
            assert.equal(true, require(lambdaPaths.lambda1).lambda.deploy);
            assert.equal(false, require(lambdaPaths.lambda2).lambda.deploy);
            assert.equal(false, require(lambdaPaths.lambda3).lambda.deploy);
            return CmdTag.tagAll(JAWS, 'lambda', false);
          })
          .then(function() {
            assert.equal(true, require(lambdaPaths.lambda1).lambda.deploy);
            assert.equal(true, require(lambdaPaths.lambda2).lambda.deploy);
            assert.equal(true, require(lambdaPaths.lambda3).lambda.deploy);
            return CmdTag.tagAll(JAWS, 'lambda', true);
          })
          .then(function() {
            assert.equal(false, require(lambdaPaths.lambda1).lambda.deploy);
            assert.equal(false, require(lambdaPaths.lambda2).lambda.deploy);
            assert.equal(false, require(lambdaPaths.lambda3).lambda.deploy);
            done();
          })
          .error(function(e) {
            done(e);
          });
    });

    it('tag endpoints', function(done) {
      this.timeout(0);

      CmdTag.tag('endpoint', lambdaPaths.lambda1, true)
          .then(function() {
            assert.equal(false, require(lambdaPaths.lambda1).endpoint.deploy);
            assert.equal(true, require(lambdaPaths.lambda2).endpoint.deploy);
            assert.equal(true, require(lambdaPaths.lambda3).endpoint.deploy);
            return CmdTag.tagAll(JAWS, 'endpoint', false);
          })
          .then(function() {
            assert.equal(true, require(lambdaPaths.lambda1).endpoint.deploy);
            assert.equal(true, require(lambdaPaths.lambda2).endpoint.deploy);
            assert.equal(true, require(lambdaPaths.lambda3).endpoint.deploy);
            return CmdTag.tagAll(JAWS, 'endpoint', true);
          })
          .then(function() {
            assert.equal(false, require(lambdaPaths.lambda1).endpoint.deploy);
            assert.equal(false, require(lambdaPaths.lambda2).endpoint.deploy);
            assert.equal(false, require(lambdaPaths.lambda3).endpoint.deploy);
            done();
          })
          .error(function(e) {
            done(e);
          });
    });
  });
});
