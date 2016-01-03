'use strict';

/**
 * Test: Env Set & Env Unset Actions
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

let validateEvent = function(options, isSet) {

  assert.equal(true, typeof options.region != 'undefined');
  assert.equal(true, typeof options.stage != 'undefined');
  assert.equal('ENV_SET_TEST_KEY', options.key);

  if(isSet) assert.equal('ENV_SET_TEST_VAL', options.value);


};

describe('Test Env Set & Env Unset actions', function() {

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

  describe('Env Set & Env Unset', function() {
    it('Sets then unsets an env var', function(done) {

      this.timeout(0);

      let setEvent = {
        stage:      config.stage,
        region:     config.region,
        key:    'ENV_SET_TEST_KEY',
        value:       'ENV_SET_TEST_VAL',
      };

      serverless.actions.envSet(setEvent)
          .then(function(setoptions) {

            // Validate Set Event
            validateEvent(setoptions, true);

            let unsetEvent = {
              stage:      setoptions.stage,
              region:     setoptions.region,
              key:    setoptions.key,
            };

            serverless.actions.envUnset(unsetEvent)
                .then(function(unsetoptions) {

                  // Validate Unset Event
                  validateEvent(unsetoptions, false);

                  done();
                });
          })
          .catch(e => {
            done(e);
          });
    });
  });

});
