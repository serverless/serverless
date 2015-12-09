'use strict';

/**
 * Test: Function Deploy Action
 */

let Serverless  = require('../../../lib/Serverless.js'),
    path        = require('path'),
    utils       = require('../../../lib/utils/index'),
    assert      = require('chai').assert,
    testUtils   = require('../../test_utils'),
    config      = require('../../config');

let serverless;

/**
 * Validate Event
 * - Validate an event object's properties
 */

let validateEvent = function(evt) {
  assert.equal(true, typeof evt.stage != 'undefined');
  assert.equal(true, typeof evt.regions != 'undefined');
  assert.equal(true, typeof evt.all != 'undefined');
  assert.equal(true, typeof evt.aliasFunction != 'undefined');
  assert.equal(true, typeof evt.functions != 'undefined');
  assert.equal(true, typeof evt.deployed != 'undefined');

  if (evt.failed) {
    for (let i = 0; i < Object.keys(evt.failed).length; i++) {
      console.log(Object.keys(evt.failed)[i]);
      console.log(evt.failed[Object.keys(evt.failed)[i]]);
    }
  }

  assert.equal(true, typeof evt.failed === 'undefined');
};

/**
 * Create Test Project
 */

describe('Test Action: Function Deploy', function() {

  before(function(done) {
    this.timeout(0);

    testUtils.createTestProject(config, ['moduleone'])
        .then(projPath => {

          process.chdir(projPath);

          serverless = new Serverless({
            interactive: false,
            awsAdminKeyId:     config.awsAdminKeyId,
            awsAdminSecretKey: config.awsAdminSecretKey
          });

          done();
        });
  });

  after(function(done) {
    done();
  });

  /**
   * Tests
   */

  describe('Function Deploy: Specify One Path', function() {
    it('should deploy functions', function(done) {

      this.timeout(0);

      let event = {
        stage:      config.stage,
        region:     config.region,
        paths:      [
          'moduleone/simple#simpleOne'
        ]
      };

      serverless.actions.functionDeploy(event)
          .then(function(evt) {
            validateEvent(evt);
            done();
          })
          .catch(e => {
            done(e);
          });
    });
  });

  describe('Function Deploy: Specify All Paths', function() {
    it('should deploy code', function(done) {

      this.timeout(0);

      let event = {
        stage:      config.stage,
        region:     config.region,
        all:        true
      };

      serverless.actions.functionDeploy(event)
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
