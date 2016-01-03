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

let validateEvent = function(options) {

  assert.equal(true, typeof options.region != 'undefined');
  assert.equal(true, typeof options.stage != 'undefined');
  assert.equal('SERVERLESS_STAGE', options.key);
  assert.equal('development', options.valByRegion[options.region]);

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

      let options = {
        stage:      config.stage,
        region:     config.region,
        key:        'SERVERLESS_STAGE'
      };

      serverless.actions.envGet(options)
          .then(function(options) {

            // Validate returned data
            validateEvent(options);

            done();
          })
          .catch(e => {
            done(e);
          });
    });
  });

});
