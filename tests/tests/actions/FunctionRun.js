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
  assert.equal(true, typeof evt.function != 'undefined');
  assert.equal(true, typeof evt.function.event != 'undefined');
  assert.equal(true, typeof evt.result != 'undefined');
  assert.equal(true, typeof evt.function.handler != 'undefined');
};

describe('Test Action: Function Run', function() {

  before(function(done) {
    this.timeout(0);

    testUtils.createTestProject(config, ['moduleone/simple'])
        .then(projPath => {

          this.timeout(0);

          process.chdir(projPath);

          serverless = new Serverless({
            interactive: true,
            awsAdminKeyId:     config.awsAdminKeyId,
            awsAdminSecretKey: config.awsAdminSecretKey
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
        path: 'moduleone/simple#simpleOne'
      })
          .then(function(evt) {
            validateEvent(evt);
            assert.equal(true, evt.result.status == 'success');
            done();
          })
          .catch(e => {
            done(e);
          });
    });
  });

  describe('Function Run w/ Name', function() {
    it('should run the function with no errors', function(done) {

      this.timeout(0);

      serverless.actions.functionRun({
            name: 'simpleOne'
          })
          .then(function(evt) {
            validateEvent(evt);
            assert.equal(true, evt.result.status == 'success');
            done();
          })
          .catch(e => {
            done(e);
          });
    });
  });

});
