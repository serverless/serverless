'use strict';

// Dependencies
var testUtils = require('../test_utils');

module.exports = function(testData, cb) {

  before(function() {
    testData.projectPath = testUtils.createTestProject();
  });

  after(function() {
    testUtils.deleteTestProject(testData.projectPath);
    return cb(testData);
  });

  describe('Test deploy api command', function() {
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