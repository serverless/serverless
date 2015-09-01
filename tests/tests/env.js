'use strict';

/**
 * JAWS Test: ENV Command
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

    it('Install module', function(done) {
      this.timeout(0);

      var JAWS = require('../../lib/index.js'),
          JawsError = require('../../lib/jaws-error');

      JAWS.install('https://github.com/jaws-stack/jaws-users-crud-ddb-jwt-js')
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