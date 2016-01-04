'use strict';

/**
 * Test: Function Run Action
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
  console.log(evt)
  assert.equal(true, typeof evt.options.function != 'undefined');
  assert.equal(true, typeof evt.options.function.handler != 'undefined');
  assert.equal(true, typeof evt.data.result != 'undefined');
  assert.equal(true, evt.data.result.status === 'success');
};

describe('Test Action: Function Run', function() {

  before(function(done) {
    this.timeout(0);

    testUtils.createTestProject(config, ['moduleone/functions/one'])
        .then(projPath => {

          this.timeout(0);

          process.chdir(projPath);

          serverless = new Serverless({
            interactive: true,
            awsAdminKeyId:     config.awsAdminKeyId,
            awsAdminSecretKey: config.awsAdminSecretKey,
            projectPath: projPath
          });

          done();
        });
  });

  after(function(done) {
    done();
  });

  describe('Function Run w/ Path', function() {
    it('should run the function with no errors', function(done) {

      this.timeout(0);
      let evt = {
        options: {
          path: ['moduleone/one']
        }
      };
      serverless.actions.functionRun(evt)
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
