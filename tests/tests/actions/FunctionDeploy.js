'use strict';

/**
 * Test: Function Deploy Action
 */

let JAWS      = require('../../../lib/Jaws.js'),
    path      = require('path'),
    utils     = require('../../../lib/utils/index'),
    assert    = require('chai').assert,
    testUtils = require('../../test_utils'),
    config    = require('../../config');

let Jaws;

describe('Test action: Function Deploy', function() {

  before(function(done) {
    this.timeout(0);
    testUtils.createTestProject(config)
        .then(projPath => {
          process.chdir(projPath);

          Jaws = new JAWS({
            interactive: false,
          });

          done();
        });
  });

  after(function(done) {
    done();
  });

  describe('Function Deploy Endpoint positive tests', function() {

    it('Function Deploy Endpoint', function(done) {
      this.timeout(0);

      Jaws.actions.functionDeploy(
          config.stage,
          config.region,
          config.noExecuteCf,
          'endpoint',
          'aws_modules/users/create'
          )
          .then(function() {
            done();
          })
          .catch(e => {
            done(e);
          });
    });
  });
});
