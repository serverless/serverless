'use strict';

/**
 * JAWS Test: Deploy Lambda Command
 */

var testUtils = require('../test_utils'),
    path = require('path');

module.exports = function(testData, cb) {

  describe('Test "deploy lambda" command', function() {

    before(function() {
      testData.projectPath = testUtils.createTestProject(
          testData.name,
          testData.region,
          testData.stage,
          testData.iamRoleARN,
          testData.envBucket);
      process.chdir(path.join(testData.projectPath, 'back/users/lambdas/show'));
    });

    after(function(done) {
      cb(testData);
      done();
    });

    it('Deploy Lambda', function(done) {

      this.timeout(0);

      // Require
      var JAWS = require('../../lib/index.js');

      // Test
      JAWS.deployLambdas(testData.stage, false, false)
          .then(function(d) {
            done();
          })
          .error(function(e) {
            done(e);
          });
    });
  });
};