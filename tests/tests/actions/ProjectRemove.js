
'use strict';

/**
 * Test: Project Remove Action
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
  assert.equal(true, typeof evt.data !== 'undefined');
  assert.equal(true, typeof evt.data.project !== 'undefined');
};

/**
 * Tests
 */

describe('Test Action: Project Remove', function() {

  before(function(done) {
    this.timeout(0);

    testUtils.createTestProject(config)
      .then(projPath => {
        this.timeout(0);
        process.chdir(projPath);  // Ror some weird reason process.chdir adds /private/ before cwd path

        serverless = new Serverless( projPath, {
          interactive: false,
          awsAdminKeyId:     config.awsAdminKeyId,
          awsAdminSecretKey: config.awsAdminSecretKey
        });

        return serverless.init().then(function() {
          done();
        });
      });
  });

  after(function(done) {
    done();
  });

  describe('Project Remove positive tests', function() {
    it('should remove project', function(done) {
      this.timeout(0);

      let evt = {
        options: {
          noExeCf:    config.noExecuteCf
        }
      };

      serverless.actions.projectRemove(evt)
        .then(function(evt) {
          // Validate Event
          validateEvent(evt);
          done()
        })
        .catch(done);
    });
  });
});
