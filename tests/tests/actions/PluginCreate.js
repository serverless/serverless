
'use strict';

/**
 * Test: Plugin Create Action
 */

let Serverless    = require('../../../lib/Serverless'),
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
  assert.equal(true, typeof evt.data.name !== 'undefined');
};

/**
 * Tests
 */

describe('Test Action: Plugin Create', function() {
  this.timeout(0);

  before(function() {

    return testUtils.createTestProject(config)
      .then(projectPath => {

        this.timeout(0);
        process.chdir(projectPath);

        serverless = new Serverless({
          projectPath,
          interactive: false,
          awsAdminKeyId:     config.awsAdminKeyId,
          awsAdminSecretKey: config.awsAdminSecretKey
        });

        return serverless.init();
      });
  });

  describe('Plugin Create positive tests', function() {
    it('should create a plugin', function() {

      let evt = {
        options: {
          skipNpm: true,
          name: 'test-plugin'
        }
      };

      return serverless.actions.pluginCreate(evt)
        .then(validateEvent);
    });
  });
});
