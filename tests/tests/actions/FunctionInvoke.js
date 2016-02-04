'use strict';

/**
 * Test: Function Invoke Action
 * - Invokes a function
 */

let Serverless = require('../../../lib/Serverless.js'),
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
  assert.equal(true, typeof evt.options.stage != 'undefined');
  assert.equal(true, typeof evt.options.region != 'undefined');
  assert.equal(true, typeof evt.data.lambdaName != 'undefined');
  assert.equal(true, typeof evt.data.payload != 'undefined');

};

describe('Test action: Function invoke', function() {
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
    });
  });

  describe('Function Invoke positive tests', function() {

    it('should invoke the function', function() {
      let evt = {
        options: {
          stage:     config.stage,
          region:    config.region,
          path: 'nodejscomponent/module1/function1'
        }
      };

      return serverless.actions.functionInvoke(evt)
        .then(validateEvent);
    });
  });
});
