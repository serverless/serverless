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

let validateEvent = function(options) {

  assert.equal(true, typeof options.region != 'undefined');
  assert.equal(true, typeof options.stage != 'undefined');
  assert.equal(options.region, options.envMapsByRegion[0].regionName);
  assert.equal('development', options.envMapsByRegion[0].vars.SERVERLESS_STAGE);
  assert.equal('development', options.envMapsByRegion[0].vars.SERVERLESS_DATA_MODEL_STAGE);

};

describe('Test Action: Env List', function() {

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

  describe('Env List', function() {
    it('Env List', function(done) {

      this.timeout(0);


      let event = {
        stage:      config.stage,
        region:     config.region,
      };

      serverless.actions.envList(event)
          .then(function(options) {

            // Validate Event
            validateEvent(options);

            done();
          })
          .catch(e => {
            done(e);
          });

    });
  });

});
