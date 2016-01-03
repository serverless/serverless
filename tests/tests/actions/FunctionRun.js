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

let validateEvent = function(options) {
  assert.equal(true, typeof options.function != 'undefined');
  assert.equal(true, typeof options.event != 'undefined');
  assert.equal(true, typeof options.result != 'undefined');
  assert.equal(true, typeof options.function.handler != 'undefined');
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

      serverless.actions.functionRun({
        path: 'moduleone/one'
      })
          .then(function(options) {

            validateEvent(options);
            assert.equal(true, options.result.status === 'success');
            done();
          })
          .catch(e => {
            done(e);
          });
    });
  });

});
