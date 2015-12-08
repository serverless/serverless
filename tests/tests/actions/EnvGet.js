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
  
  assert.equal(true, typeof evt.region != 'undefined');
  assert.equal(true, typeof evt.stage != 'undefined');
  assert.equal('SERVERLESS_STAGE', evt.key);
  assert.equal('development', evt.valByRegion[evt.region]);

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
            awsAdminSecretKey: config.awsAdminSecretKey
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

      let event = {
        stage:      config.stage,
        region:     config.region,
        key:        'SERVERLESS_STAGE',
      };

      serverless.actions.envGet(event)
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
