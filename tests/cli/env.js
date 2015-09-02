'use strict';

/**
 * JAWS Test: ENV Command
 */

var testUtils = require('../test_utils'),
    path = require('path'),
    assert = require('chai').assert;

var config = require('../config');

describe('Test "env" command', function() {

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
    it('Test env command', function(done) {
      this.timeout(0);

      var JAWS = require('../../lib/index.js');

      JAWS.listEnv(config.stage)
          .then(function(d) {
            done();
          })
          .error(function(e) {
            done(e);
          });
    });
  });
});