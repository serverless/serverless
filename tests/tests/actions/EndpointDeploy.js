'use strict';

/**
 * Test: Endpoint Deploy Action
 */

let JAWS      = require('../../../lib/Jaws.js'),
    path      = require('path'),
    utils     = require('../../../lib/utils/index'),
    assert    = require('chai').assert,
    testUtils = require('../../test_utils'),
    config    = require('../../config');

let Jaws;

describe('Test action: Endpoint Deploy', function() {

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

  describe('Endpoint Deploy positive tests', function() {

    it('Endpoint Deploy', function(done) {
      this.timeout(0);

      Jaws.actions.endpointDeploy(
          config.stage,
          config.region,
          config.noExecuteCf,
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
