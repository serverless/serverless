'use strict';

/**
 * Test: Function Create Action
 * - Creates a new private in your system's temp directory
 * - Creates a new Function inside the "users" module
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
  assert.equal(true, typeof evt.options.path != 'undefined');
};

describe('Test action: Function Create', function() {

  before(function(done) {
    this.timeout(0);
    testUtils.createTestProject(config)
        .then(projectPath => {

          process.chdir(projectPath);

          serverless = new Serverless({
            projectPath,
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

  describe('Function Create positive tests', function() {

    it('create a new Function inside the users Component', function(done) {
      this.timeout(0);
      let evt = {
        options: {
          path: 'functions/temp',
          template: 'function'
        }
      };

      serverless.actions.functionCreate(evt)
          .then(function(evt) {
            validateEvent(evt);
            let functionJson = utils.readFileSync(serverless.getProject().getRootPath('functions', 'temp', 's-function.json'));
            assert.equal(functionJson.name, 'temp');
            done();
          })
          .catch(e => {
            done(e);
          });
    });
  });
});
