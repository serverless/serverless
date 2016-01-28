
'use strict';

/**
 * Test: Region Remove Action
 */

let Serverless    = require('../../../lib/Serverless'),
    path          = require('path'),
    assert        = require('chai').assert,
    testUtils     = require('../../test_utils'),
    config        = require('../../config');

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

/**
 * Tests
 */

describe('Test Action: Region Remove', function() {

  before(function(done) {
    this.timeout(0);

    testUtils.createTestProject(config)
      .then(projPath => {
        this.timeout(0);
        process.chdir(projPath);  // Ror some weird reason process.chdir adds /private/ before cwd path

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

  describe('Region Remove positive tests', function() {
    it('should remove region', function(done) {
      this.timeout(0);

      let evt = {
        options: {
          stage:      config.stage,
          region:     config.region2,
          noExeCf:    config.noExecuteCf
        }
      };

      serverless.actions.regionCreate(evt)
        // .then(() => serverless.actions.resourcesDeploy(evt))
        .then(() => serverless.actions.regionRemove(evt))
        .then(function(evt) {
          // Validate Event
          validateEvent(evt);
          done()
        })
        .catch(done);
    });
  });
});
