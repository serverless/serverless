'use strict';

/**
 * JAWS Test: Deploy Lambda Command
 */
var testUtils = require('../test_utils'),
    path = require('path'),
    assert = require('chai').assert;

var config = require('../config');


describe('Test "deploy lambda" command', function() {

  before(function() {
    config.projectPath = testUtils.createTestProject(
        config.name,
        config.region,
        config.stage,
        config.iamRoleARN,
        config.envBucket);
    process.chdir(path.join(config.projectPath, 'back/users/lambdas/show'));
  });

  after(function(done) {
    done();
  });

  describe('Positive tests', function() {
    it('Deploy Lambda', function(done) {

      this.timeout(0);

      // Require
      var JAWS = require('../../lib/index.js');

      // Test
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