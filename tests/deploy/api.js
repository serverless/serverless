'use strict';

/**
 * JAWS Test: Deploy API Command
 * - Copies the test-prj template to your system's temp directory
 * - Deploys an API based on the endpoints in the project
 */
var testUtils = require('../test_utils');

module.exports = function(testData, cb) {

  describe('Test deploy api command', function() {

    before(function() {
      testData.projectPath = testUtils.createTestProject(testData.name);
      process.chdir(testData.projectPath);
    });

    after(function(done) {
      cb(testData);
      done();
    });

    it('Doesn\'t error', function(done) {

      this.timeout(0);

      // Require
      var JAWS = require('../../lib/index.js'),
          JawsError = require('../../lib/jaws-error');

      // Test
      JAWS.deployApi('dev')
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