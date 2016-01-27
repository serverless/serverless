'use strict';

/**
 * Test: Resources Remove Action
 * - Creates a new private in your system's temp directory
 * - Makes a tiny update to the private's CF template
 * - Deploy new CF template
 * - Deploy/Rollback the original CF template for cleaning
 */

let Serverless = require('../../../lib/Serverless.js'),
    path       = require('path'),
    utils      = require('../../../lib/utils/index'),
    assert     = require('chai').assert,
    testUtils  = require('../../test_utils'),
    SUtils     = require('../../../lib/utils/index'),
    fs         = require('fs'),
    config     = require('../../config');

let serverless;

/**
 * Validate Event
 * - Validate an event object's properties
 */

let validateEvent = function(evt) {
  assert.equal(true, typeof evt.options.region !== 'undefined');
  assert.equal(true, typeof evt.options.stage !== 'undefined');
  assert.equal(true, typeof evt.data !== 'undefined');
};

describe.only('Test action: Resources Remove', function() {

  before(function(done) {
    this.timeout(0);
    testUtils.createTestProject(config)
        .then(projPath => {

          process.chdir(projPath);

          serverless = new Serverless({
            interactive: false,
            awsAdminKeyId:     config.awsAdminKeyId,
            awsAdminSecretKey: config.awsAdminSecretKey,
            projectPath: projPath
          });

          return serverless.init()
            .then(function() {

            SUtils.sDebug('Adding test bucket resource');

            let newProject = serverless.state.project.get();
            // adding new Module resource
            newProject.components.nodejscomponent.modules.module1.cloudFormation.resources['testBucket' + (new Date).getTime().toString()] = { "Type" : "AWS::S3::Bucket" };
            serverless.state.set({project: newProject});

            return serverless.state.save()
              .then(function() {
                done();
              });
          });
        });
  });

  after(function(done) {
    done();
  });

  describe('Resources Remove positive tests', function() {

    it('remove a CF template', function(done) {

      this.timeout(0);
      let evt = {
        stage:      config.stage,
        region:     config.region,
        noExeCf:    config.noExecuteCf
      };

      serverless.actions.resourcesDeploy(evt)
          .then(() => serverless.actions.resourcesRemove(evt))
          .then(function(evt) {
            // Validate Evt
            validateEvent(evt);
            done();

          })
          .catch(e => {
            done(e);
          });
    });
  });
});
