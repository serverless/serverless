'use strict';

/**
 * Test: Function Logs Action
 * - Invokes a function
 * - Gets logs for the function
 */

let Serverless = require('../../../lib/Serverless.js'),
    path       = require('path'),
    utils      = require('../../../lib/utils/index'),
    assert     = require('chai').assert,
    testUtils  = require('../../test_utils'),
    config     = require('../../config');

let Lambda     = require('../../../lib/utils/aws/Lambda')({
      region:          config.region,
      accessKeyId:     config.awsAdminKeyId,
      secretAccessKey: config.awsAdminSecretKey
    });

let serverless;

/**
 * Validate Event
 * - Validate an event object's properties
 */

let validateEvent = function(evt) {
  assert.equal(true, typeof evt.options.component != 'undefined');
  assert.equal(true, typeof evt.options.module != 'undefined');
  assert.equal(true, typeof evt.options.function != 'undefined');
  assert.equal(true, typeof evt.data.results != 'undefined');
};

describe('Test action: Function Logs', function() {
  this.timeout(0);

  before(function() {
    return Lambda.invokePromised({
      FunctionName: 's-test-prj-nodejscomponent-module1-function1',
      Qualifier: config.stage
    })
    .then(() => testUtils.createTestProject(config))
    .then(projPath => {
      process.chdir(projPath);

      serverless = new Serverless({
        awsAdminKeyId:     config.awsAdminKeyId,
        awsAdminSecretKey: config.awsAdminSecretKey,
        interactive: false,
        projectPath: projPath
      });
      return serverless.state.load();
    });
  });

  describe('Function Logs positive tests', function() {

    it('should get logs for the function', function() {
      let evt = {
        options: {
          component: 'nodejscomponent',
          module:    'module1',
          function:  'function1',
          stage:     config.stage,
          region:    config.region,
          duration: '7days',
          path: 'nodejscomponent/module1/function1'
        }

      };

      return serverless.actions.functionLogs(evt)
        .then(validateEvent);
    });
  });
});
