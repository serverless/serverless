'use strict';

/**
 * JAWS Test: Deploy API Command
 * - Copies the test-prj template to your system's temp directory
 * - Deploys an API based on the endpoints in the project
 */
var testUtils = require('../test_utils'),
    path = require('path'),
    assert = require('chai').assert,
    Promise = require('bluebird');

var config = require('../config');

describe('Test "tag" command', function() {

  before(function(done) {
    config.projectPath = testUtils.createTestProject(
        config.name,
        config.region,
        config.stage,
        config.iamRoleARN,
        config.envBucket);

    process.chdir(config.projectPath);

    // Get Lambda Paths
    config.lambda1 = path.join(config.projectPath, 'back', 'lambdas', 'users', 'show', 'jaws.json');
    config.lambda2 = path.join(config.projectPath, 'back', 'lambdas', 'users', 'signin', 'jaws.json');
    config.lambda3 = path.join(config.projectPath, 'back', 'lambdas', 'users', 'signup', 'jaws.json');
    done();
  });

  after(function(done) {
    done();
  });

  describe('Positive tests', function() {
    it('tag lambdas', function(done) {

      this.timeout(0);

      var JAWS = require('../../lib/index.js');

      JAWS.tag('lambda', config.lambda1, false)
          .then(function() {
            assert.equal(true, require(config.lambda1).lambda.deploy);
            assert.equal(false, require(config.lambda2).lambda.deploy);
            assert.equal(false, require(config.lambda3).lambda.deploy);
            return JAWS.tagAll('lambda', false);
          })
          .then(function() {
            assert.equal(true, require(config.lambda1).lambda.deploy);
            assert.equal(true, require(config.lambda2).lambda.deploy);
            assert.equal(true, require(config.lambda3).lambda.deploy);
            return JAWS.tagAll('lambda', true);
          })
          .then(function() {
            assert.equal(false, require(config.lambda1).lambda.deploy);
            assert.equal(false, require(config.lambda2).lambda.deploy);
            assert.equal(false, require(config.lambda3).lambda.deploy);
            done();
          })
          .error(function(e) {
            done(e);
          });
    });

    it('api tags', function(done) {
      this.timeout(0);

      var JAWS = require('../../lib/index.js');

      JAWS.tag('api', config.lambda1)
          .then(function() {
            assert.equal(true, require(config.lambda1).lambda.deploy);
            assert.equal(false, require(config.lambda2).lambda.deploy);
            assert.equal(false, require(config.lambda3).lambda.deploy);
            return JAWS.tagAll('api', false);
          })
          .then(function() {
            assert.equal(true, require(config.lambda1).lambda.deploy);
            assert.equal(true, require(config.lambda2).lambda.deploy);
            assert.equal(true, require(config.lambda3).lambda.deploy);
            return JAWS.tagAll('api', true);
          })
          .then(function() {
            assert.equal(false, require(config.lambda1).lambda.deploy);
            assert.equal(false, require(config.lambda2).lambda.deploy);
            assert.equal(false, require(config.lambda3).lambda.deploy);
            done();
          })
          .error(function(e) {
            done(e);
          });
    });
  });
});
