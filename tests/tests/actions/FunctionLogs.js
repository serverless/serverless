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
    path: 'nodejscomponent/module1/function1'
  }
};

describe('Test action: Function Logs', function() {
  this.timeout(0);

  before(function() {
    return testUtils.createTestProject(config)
    .then(projPath => {
      process.chdir(projPath);

      serverless = new Serverless({
        awsAdminKeyId:     config.awsAdminKeyId,
        awsAdminSecretKey: config.awsAdminSecretKey,
        interactive: false,
        projectPath: projPath
      });
      return serverless.state.load();
    })
    .then(() => {
      return serverless.actions.functionInvoke(evt);
    });
  });

  describe('Function Logs positive tests', function() {

    it('should get logs for the function', function() {

      return serverless.actions.functionLogs(evt)
        .then(validateEvent);
    });
  });
});
