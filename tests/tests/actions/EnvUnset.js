'use strict';

/**
 * Test: Env Unset Action
 */

let Serverless      = require('../../../lib/Serverless.js'),
    path      = require('path'),
    utils     = require('../../../lib/utils/index'),
    assert    = require('chai').assert,
    testUtils = require('../../test_utils'),
    config    = require('../../config');

let serverless;

describe('Test Action: Env Unset', function() {

  before(function(done) {
    this.timeout(0);

    testUtils.createTestProject(config)
        .then(projPath => {
          process.chdir(projPath);
          serverless = new Serverless({
            interactive: false,
            awsAdminKeyId:     config.awsAdminKeyId,
            awsAdminSecretKey: config.awsAdminSecretKey
          });

          done();
        });
  });

  after(function(done) {
    done();
  });

  describe('Env Unset', function() {
    it('Env Unset', function(done) {

      this.timeout(0);

      let event = {
        stage:      config.stage,
        region:     config.region,
        key:        'SERVERLESS_STAGE',
      };

      serverless.actions.envUnset(event)
          .then(function() {
            done();
          })
          .catch(e => {
            done(e);
          });
    });
  });

});
