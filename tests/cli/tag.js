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

module.exports = function(testData, cb) {

  describe('Test "tag" command', function() {

    before(function(done) {
      testData.projectPath = testUtils.createTestProject(
          testData.name,
          testData.region,
          testData.stage,
          testData.iamRoleARN,
          testData.envBucket);
      process.chdir(testData.projectPath);

      // Get Lambda Paths
      testData.lambda1 = path.join(testData.projectPath, 'back', 'users', 'lambdas', 'show', 'jaws.json');
      testData.lambda2 = path.join(testData.projectPath, 'back', 'users', 'lambdas', 'signin', 'jaws.json');
      testData.lambda3 = path.join(testData.projectPath, 'back', 'users', 'lambdas', 'signup', 'jaws.json');
      done();
    });

    after(function(done) {
      cb(testData);
      done();
    });

    it('tag lambdas', function (done) {

      this.timeout(0);

      var JAWS = require('../../lib/index.js');

      JAWS.tag('lambda', testData.lambda1, '')
          .then(function () {
            assert.equal(true, require(testData.lambda1).lambda.deploy);
            assert.equal(false, require(testData.lambda2).lambda.deploy);
            assert.equal(false, require(testData.lambda3).lambda.deploy);
            return JAWS.tagAll('lambda', false);
          })
          .then(function () {
            assert.equal(true, require(testData.lambda1).lambda.deploy);
            assert.equal(true, require(testData.lambda2).lambda.deploy);
            assert.equal(true, require(testData.lambda3).lambda.deploy);
            return JAWS.tagAll('lambda', true);
          })
          .then(function () {
            assert.equal(false, require(testData.lambda1).lambda.deploy);
            assert.equal(false, require(testData.lambda2).lambda.deploy);
            assert.equal(false, require(testData.lambda3).lambda.deploy);
            done();
          })
          .error(function (e) {
            done(e);
          });
    });

    it('api tags', function(done) {
      this.timeout(0);

      var JAWS = require('../../lib/index.js');

      JAWS.tag('api', testData.lambda1)
          .then(function() {
            assert.equal(true, require(testData.lambda1).lambda.deploy);
            assert.equal(false, require(testData.lambda2).lambda.deploy);
            assert.equal(false, require(testData.lambda3).lambda.deploy);
            return JAWS.tagAll('api', false);
          })
          .then(function() {
            assert.equal(true, require(testData.lambda1).lambda.deploy);
            assert.equal(true, require(testData.lambda2).lambda.deploy);
            assert.equal(true, require(testData.lambda3).lambda.deploy);
            return JAWS.tagAll('api', true);
          })
          .then(function() {
            assert.equal(false, require(testData.lambda1).lambda.deploy);
            assert.equal(false, require(testData.lambda2).lambda.deploy);
            assert.equal(false, require(testData.lambda3).lambda.deploy);
            done();
          })
          .error(function(e) {
            done(e);
          });
    });
  });
};