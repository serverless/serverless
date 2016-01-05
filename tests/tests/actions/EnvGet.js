'use strict';

/**
 * Test: Env Get Action
 */

let Serverless = require('../../../lib/Serverless.js'),
    path       = require('path'),
    utils      = require('../../../lib/utils/index'),
    assert     = require('chai').assert,
    testUtils  = require('../../test_utils'),
    config     = require('../../config');

let serverless;

/**
 * Validate Event
 * - Validate an event object's properties
 */

let validateEvent = function(evt) {
  assert.equal(true, typeof evt.options.region != 'undefined');
  assert.equal(true, typeof evt.options.stage != 'undefined');
  assert.equal('SERVERLESS_STAGE', evt.options.key);
  assert.equal('development', evt.data.valuesByRegion[evt.options.region][evt.options.key]);
};

describe('Test Action: Env Get', function() {

  before(function(done) {
    this.timeout(0);

    testUtils.createTestProject(config)
        .then(projPath => {
          this.timeout(0);

          process.chdir(projPath);
          serverless = new Serverless({
            interactive: false,
            awsAdminKeyId:     config.awsAdminKeyId,
            awsAdminSecretKey: config.awsAdminSecretKey,
            projectPath: projPath
          });

          done();
        });
  });

  after(function(done) {
    done();
  });

  describe('Env Get', function() {
    it('Should Get Env Var', function(done) {

      this.timeout(0);

      let evt = {
        stage:      config.stage,
        region:     config.region,
        key:        'SERVERLESS_STAGE'
      };

      serverless.actions.envGet(evt)
          .then(function(evt) {

            // Validate returned data
            validateEvent(evt);

            done();
          })
          .catch(e => {
            done(e);
          });
    });
  });

});
