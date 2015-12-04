'use strict';

/**
 * Test: Endpoint Deploy Action
 */

let Serverless      = require('../../../lib/Serverless.js'),
    path      = require('path'),
    utils     = require('../../../lib/utils/index'),
    assert    = require('chai').assert,
    testUtils = require('../../test_utils'),
    config    = require('../../config');

let serverless;

describe('Test action: Endpoint Deploy', function() {

  before(function(done) {
    this.timeout(0);
    testUtils.createTestProject(config)
        .then(projPath => {
          process.chdir(projPath);

          serverless = new Serverless({
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

      serverless.actions.endpointDeploy(
          config.stage,
          config.region,
          config.noExecuteCf,
          'modules/users/create'
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
