'use strict';

/**
 * Test: Function Logs Action
 * - Invokes a function
 * - Gets logs for the function
 */

let Serverless = require('../../../lib/Serverless.js'),
    assert     = require('chai').assert,
    testUtils  = require('../../test_utils'),
    config     = require('../../config');

let serverless;

/**
 * Validate Event
 * - Validate an event object's properties
 */

let validateEvent = function(evt) {
  assert.equal(true, typeof evt.options.stage != 'undefined');
  assert.equal(true, typeof evt.options.region != 'undefined');
  assert.equal(true, typeof evt.data.results != 'undefined');
};

const evt = {
  options: {
    stage:     config.stage,
    region:    config.region,
    duration: '7days',
    name: 'function1'
  }
};

describe('Test action: Function Logs', function() {
  this.timeout(0);

  before(function() {
    return testUtils.createTestProject(config)
    .then(projectPath => {
      process.chdir(projectPath);

      serverless = new Serverless({
        projectPath,
        interactive: false,
        awsAdminKeyId:     config.awsAdminKeyId,
        awsAdminSecretKey: config.awsAdminSecretKey
      });

      return serverless.init();
    })
    .then(() => {
      return serverless.actions.functionRun(evt);
    });
  });

  describe('Function Logs positive tests', function() {

    it('should get logs for the function', function() {

      return serverless.actions.functionLogs(evt)
        .then(validateEvent);
    });
  });
});
