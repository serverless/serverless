'use strict';

/**
 * Test: Stage Create Action
 */

let Serverless      = require('../../../lib/Serverless.js'),
    path      = require('path'),
    utils     = require('../../../lib/utils/index'),
    assert    = require('chai').assert,
    testUtils = require('../../test_utils'),
    os        = require('os'),
    config    = require('../../config');

let serverless;

describe('Test Action: Stage Create', function() {

  before(function(done) {
    this.timeout(0);

    testUtils.createTestProject(config)
        .then(projPath => {

          this.timeout(0);
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

  describe('Stage Create', function() {
    it('should create stage', function(done) {

      this.timeout(0);

      let event = {
        stage:      config.stage2,
        region:     config.region2,
        noExeCf:    config.noExecuteCf,
      };

      serverless.actions.stageCreate(event)
          .then(function() {
            done();
          })
          .catch(e => {
            done(e);
          });
    });
  });
});
