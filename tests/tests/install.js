'use strict';

/**
 * JAWS Test: Install Command
 */

var testUtils = require('../test_utils'),
    path = require('path');

module.exports = function(testData, cb) {

  describe('Test "install" command', function() {

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

    it('Without options', function(done) {
      this.timeout(0);

      var JAWS = require('../../lib/index.js'),
          JawsError = require('../../lib/jaws-error');

      JAWS.install()
          .then(function() {
            done();
          })
          .catch(JawsError, function(e) {
            done(e);
          })
          .error(function(e) {
            done(e);
          });
    });
  });
};