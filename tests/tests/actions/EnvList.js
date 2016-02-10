'use strict';

/**
 * Test: Env List Action
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
  assert.equal(evt.options.region, evt.data.variablesByRegion[0].region);
  assert.equal('development', evt.data.variablesByRegion[0].vars.SERVERLESS_STAGE);
  assert.equal('development', evt.data.variablesByRegion[0].vars.SERVERLESS_DATA_MODEL_STAGE);

};

describe('Test Action: Env List', function() {

  before(function(done) {
    this.timeout(0);

    testUtils.createTestProject(config)
        .then(projPath => {
          this.timeout(0);

          process.chdir(projPath);

          serverless = new Serverless( projPath, {
            interactive: false,
            awsAdminKeyId:     config.awsAdminKeyId,
            awsAdminSecretKey: config.awsAdminSecretKey
          });

          return serverless.state.load().then(function() {
            done();
          });
        });
  });

  after(function(done) {
    done();
  });

  describe('Env List', function() {
    it('Env List', function(done) {

      this.timeout(0);


      let evt = {
        stage:      config.stage,
        region:     config.region,
      };

      serverless.actions.envList(evt)
          .then(function(evt) {

            // Validate Event
            validateEvent(evt);

            done();
          })
          .catch(e => {
            done(e);
          });

    });
  });

});
