'use strict';

/**
 * Test: Component Create Action
 * - Creates a new project in your system's temp directory
 * - Creates a new Component inside test project
 */

let Serverless  = require('../../../lib/Serverless.js'),
  path          = require('path'),
  utils         = require('../../../lib/utils/index'),
  assert        = require('chai').assert,
  testUtils     = require('../../test_utils'),
  config        = require('../../config');

let serverless;

/**
 * Validate Event
 * - Validate an event object's properties
 */

let validateEvent = function(evt) {
  assert.equal(true, typeof evt.options.runtime != 'undefined');
  assert.equal(true, typeof evt.data.sPath != 'undefined');
};

describe('Test action: Component Create', function() {

  before(function(done) {
    this.timeout(0);
    testUtils.createTestProject(config)
      .then(projPath => {

        process.chdir(projPath);

        serverless = new Serverless( projPath, {
          interactive: false
        });

        return serverless.state.load().then(function() {
          done();
        });
      });
  });

  after(function(done) {
    done();
  });

  describe('Component Create positive tests', function() {

    it('create a new component with defaults', function(done) {

      this.timeout(0);

      serverless.actions.componentCreate({
          sPath: 'newcomponent',
          runtime: 'nodejs'
        })
        .then(function(evt) {
          validateEvent(evt);
          done();
        })
        .catch(e => {
          done(e);
        });
    });
  });
});
