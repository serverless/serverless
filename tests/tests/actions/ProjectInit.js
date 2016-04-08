'use strict';

/**
 * Test: Project Init Action
 * - Creates a new private in your system's temp directory
 * - Deletes the CF stack created by the private
 */

let Serverless  = require('../../../lib/Serverless'),
  SError      = require('../../../lib/Error'),
  path        = require('path'),
  os          = require('os'),
  AWS         = require('aws-sdk'),
  uuid        = require('node-uuid'),
  utils       = require('../../../lib/utils/index'),
  assert      = require('chai').assert,
  shortid     = require('shortid'),
  config      = require('../../config');

// Instantiate
let serverless = new Serverless({
  interactive: false,
  awsAdminKeyId: config.awsAdminKeyId,
  awsAdminSecretKey: config.awsAdminSecretKey
});

/**
 * Validate Event
 * - Validate an event object's properties
 */

let validateEvent = function(evt) {
  assert.equal(true, typeof evt.options.name !== 'undefined');
  assert.equal(true, typeof evt.options.region !== 'undefined');
  assert.equal(true, typeof evt.options.noExeCf !== 'undefined');
  assert.equal(true, typeof evt.options.stage !== 'undefined');
  assert.equal(true, typeof evt.data !== 'undefined');
};

/**
 * Tests
 */

describe('Test action: Project Init', function() {

  before(function(done) {
    process.chdir(os.tmpdir());

    serverless.init().then(function(){
      done();
    });
  });

  after(function(done) {
    done();
  });

  describe('Project Init', function() {
    it('should create a new private in temp directory', function(done) {

      this.timeout(0);

      let name    = ('testprj-' + uuid.v4()).replace(/-/g, '');
      let bucket  = name + '.com';
      let evt   = {
        options: {
          name:               name,
          stage:              config.stage,
          region:             config.region,
          profile:            config.profile_development,
          noExeCf:            config.noExecuteCf
        }
      };

      serverless.actions.projectInit(evt)
        .then(function(evt) {

          let project = serverless.getProject();
          let stage   = project.getStage(config.stage);
          let region  = project.getRegion(config.stage, config.region);

          assert.equal(true, typeof project.getVariables().project != 'undefined');
          assert.equal(true, typeof stage.getVariables().stage != 'undefined');
          assert.equal(true, typeof region.getVariables().region != 'undefined');

          if (!config.noExecuteCf) {
            assert.equal(true, typeof region.getVariables().iamRoleArnLambda != 'undefined');
            assert.equal(true, typeof region.getVariables().resourcesStackName != 'undefined');
          }

          // Validate Event
          validateEvent(evt);

          done();
        })
        .catch(SError, function(e) {
          done(e);
        })
        .error(function(e) {
          done(e);
        });
    });
  });
});
