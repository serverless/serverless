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

let validateEvent = function(evt, isSet) {

  assert.equal(true, typeof evt.options.region != 'undefined');
  assert.equal(true, typeof evt.options.stage != 'undefined');
  assert.equal('ENV_SET_TEST_KEY', evt.options.key);

  if (isSet) assert.equal('ENV_SET_TEST_VAL', evt.options.value);


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

          return serverless.state.load().then(function() {
            done();
          });
        });
  });

  after(function(done) {
    done();
  });

  describe('Env Set & Env Unset', function() {
    it('Sets then unsets an env var', function(done) {

      this.timeout(0);

      let setEvt = {
        stage:      config.stage,
        region:     config.region,
        key:        'ENV_SET_TEST_KEY',
        value:      'ENV_SET_TEST_VAL'
      };

      serverless.actions.envSet(setEvt)
          .then(function(setEvt) {

            // Validate Set Event
            validateEvent(setEvt, true);

            let unsetEvt = {
              stage:      setEvt.options.stage,
              region:     setEvt.options.region,
              key:        setEvt.options.key
            };

            serverless.actions.envUnset(unsetEvt)
                .then(function(unsetEvt) {

                  // Validate Unset Event
                  validateEvent(unsetEvt, false);

                  done();
                });
          })
          .catch(e => {
            done(e);
          });
    });
  });

});
