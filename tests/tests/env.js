'use strict';

/**
 * JAWS Test: ENV Command
 */

var testUtils = require('../test_utils'),
    path = require('path');

module.exports = function(testData, cb) {

  describe('Test "env" command', function() {

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

    it('Test env command', function(done) {
      this.timeout(0);

      var JAWS = require('../../lib/index.js');

      JAWS.listEnv(testData.stage)
          .then(function(d) {
            done();
          })
          .error(function(e) {
            done(e);
          });
    });
  });
};