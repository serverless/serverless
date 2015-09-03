'use strict';

/**
 * JAWS Test: Install Command
 */

var testUtils = require('../test_utils'),
    path = require('path'),
    assert = require('chai').assert;

var config = require('../config');

describe('Test "install" command', function() {

  before(function() {
    config.projectPath = testUtils.createTestProject(
        config.name,
        config.region,
        config.stage,
        config.iamRoleARN,
        config.envBucket);
    process.chdir(path.join(config.projectPath, 'back', 'lambdas', 'users', 'show'));
  });

  after(function(done) {
    done();
  });

  describe('Positive tests', function() {
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
});