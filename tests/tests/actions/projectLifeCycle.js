'use strict';

/**
 * Test: Project Lifecycle
 * - Project Init
 * - Stage Create
 * - Region Create
 * - Resources Deploy
 * - Resources Remove
 * - Region Remove
 * - Stage Remove
 * - Project Remove
 */


let Serverless  = require('../../../lib/Serverless'),
  path          = require('path'),
  os            = require('os'),
  uuid          = require('node-uuid'),
  utils         = require('../../../lib/utils/index'),
  assert        = require('chai').assert,
  shortid       = require('shortid'),
  testUtils     = require('../../test_utils'),
  BbPromise     = require('bluebird'),
  AWS           = require('aws-sdk'),
  config        = require('../../config');


let serverless = new Serverless({
  interactive: false,
  awsAdminKeyId: config.awsAdminKeyId,
  awsAdminSecretKey: config.awsAdminSecretKey
});

/**
 * Tests
 */

describe('Test: Project Live Cycle', function() {
  this.timeout(0);

  describe('Test action: Project Init', function() {

    before(function(done) {
      process.chdir(os.tmpdir());

      serverless.init().then(function(){
        done();
      });
    });

    describe('Project Init', function() {
      it('should create a new project in temp directory', function() {

        this.timeout(0);

        let name    = ('testprj-' + uuid.v4()).replace(/-/g, '');

        let evt   = {
          options: {
            name:               name,
            profile:            config.profile_development,
            stage:              config.stage,
            region:             config.region,
            noExeCf:            config.noExecuteCf
          }
        };

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

        return serverless.actions.projectInit(evt)
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
          });
      });
    });
  });

  describe('Test Action: Stage Create', function() {

    describe('Stage Create', function() {

      it('should create stage', function() {
        let evt = {
          options: {
            stage:      config.stage2,
            region:     config.region,
            profile:    config.profile_development,
            noExeCf:    config.noExecuteCf
          }
        };

        let validateEvent = function(evt) {
          assert.equal(true, typeof evt.options.region !== 'undefined');
          assert.equal(true, typeof evt.options.stage !== 'undefined');
          assert.equal(true, typeof evt.data !== 'undefined');
        };

        return serverless.actions.stageCreate(evt)
          .then(function(evt) {

            let project = serverless.getProject();
            assert.equal(project.getStage(config.stage2).getVariables().stage, config.stage2);
            assert.equal(project.getRegion(config.stage2, config.region).getVariables().region, config.region);

            // Validate EVT
            validateEvent(evt);
          });
      });
    });
  });

  describe('Test Action: Region Create', function() {

    describe('Region Create', function() {

      it('should create region', function() {

        let evt = {
          options: {
            stage:      config.stage2,
            region:     config.region2,
            noExeCf:    false
          }
        };

        let validateEvent = function(evt) {
          assert.equal(true, typeof evt.options.region !== 'undefined');
          assert.equal(true, typeof evt.options.stage !== 'undefined');
          assert.equal(true, typeof evt.data !== 'undefined');
        };


        return serverless.actions.regionCreate(evt)
          .then(function(evt) {
            assert.equal(true, typeof serverless.getProject().getRegion(config.stage2, config.region2).getVariables().region != 'undefined');

            // Validate Event
            validateEvent(evt);
          });
      });
    });
  });

  describe('Test action: Resources Deploy', function() {

    describe('Resources Deploy positive tests', function() {

      it('deploys an updated CF template', function() {

        let evt = {
          stage:      config.stage2,
          region:     config.region2,
          noExeCf:    config.noExecuteCf
        };

        let validateEvent = function(evt) {
          assert.equal(true, typeof evt.options.region !== 'undefined');
          assert.equal(true, typeof evt.options.stage !== 'undefined');
          assert.equal(true, typeof evt.data !== 'undefined');
        };

        return serverless.actions.resourcesDeploy(evt)
          .then(validateEvent);
      });
    });
  });


 // * - Resources Remove - config.stage2, config.region2 +
  describe('Test action: Resources remove', function() {

    describe('Resources remove positive tests', function() {

      it('removes a CF template', function() {

        let evt = {
          stage:      config.stage2,
          region:     config.region2,
          noExeCf:    config.noExecuteCf
        };

        let validateEvent = function(evt) {
          assert.equal(true, typeof evt.options.region !== 'undefined');
          assert.equal(true, typeof evt.options.stage !== 'undefined');
          assert.equal(true, typeof evt.data !== 'undefined');
        };

        return serverless.actions.resourcesRemove(evt)
          .then(validateEvent);
      });
    });
  });


 // * - Region Remove - config.stage2, config.region1 +

  describe('Test action: Region remove', function() {

    describe('Region remove positive tests', function() {

      it('removes a region', function() {

        let evt = {
          stage:      config.stage2,
          region:     config.region,
          noExeCf:    config.noExecuteCf
        };

        let validateEvent = function(evt) {
          assert.equal(true, typeof evt.options.region !== 'undefined');
          assert.equal(true, typeof evt.options.stage !== 'undefined');
          assert.equal(true, typeof evt.data !== 'undefined');
        };

        return serverless.actions.regionRemove(evt)
          .then(validateEvent);
      });
    });
  });

 // * - Stage Remove - config.stage1
  describe('Test action: Stage remove', function() {

    describe('Stage remove positive tests', function() {

      it('removes a stage', function() {

        let evt = {
          stage:      config.stage,
          noExeCf:    config.noExecuteCf
        };

        let validateEvent = function(evt) {
          assert.equal(true, typeof evt.options.stage !== 'undefined');
          assert.equal(true, typeof evt.data !== 'undefined');
        };

        return serverless.actions.stageRemove(evt)
          .then(validateEvent);
      });
    });
  });

 // * - Project Remove

  describe('Test Action: Project Remove', function() {

    describe('Project Remove positive tests', function() {
      it('should remove project', function(done) {
        let evt = {
          options: {
            noExeCf:    config.noExecuteCf
          }
        };

        let validateEvent = function(evt) {
          assert.equal(true, typeof evt.data !== 'undefined');
          assert.equal(true, typeof evt.data.project !== 'undefined');
          return evt;
        };

        return serverless.actions.projectRemove(evt)
          .then(validateEvent)
          .then(function() {
            done();
          });
      });
    });
  });

});
