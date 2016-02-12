'use strict';

/**
 * Test: Endpoint Deploy Action
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
  assert.equal(true, typeof evt.options.stage   != 'undefined');
  assert.equal(true, typeof evt.options.region  != 'undefined');
  assert.equal(true, typeof evt.options.paths   != 'undefined');
  assert.equal(true, typeof evt.data.deployed   != 'undefined');

  if (evt.data.failed) {
    for (let i = 0; i < Object.keys(evt.data.failed).length; i++) {
      console.log(Object.keys(evt.data.failed)[i]);
      console.log(evt.data.failed[Object.keys(evt.data.failed)[i]]);
    }
  }

  assert.equal(true, typeof evt.data.failed === 'undefined');
};

/**
 * Create Test Project
 */

describe('Test Action: Event Deploy', function() {

  before(function(done) {
    this.timeout(0);

    testUtils.createTestProject(config)
      .then(projPath => {

        process.chdir(projPath);

        serverless = new Serverless( projPath, {
          interactive: false,
          awsAdminKeyId:     config.awsAdminKeyId,
          awsAdminSecretKey: config.awsAdminSecretKey
        });

        return serverless.state.load().then(function() {
          done();
        });
      });
  });

  after(function(done) {
    done();
  });

  /**
   * Tests
   */
  describe('Event Deploy: DynamoDB', function() {
    it('should deploy DynamoDB stream event', function(done) {

      this.timeout(0);

      let event = {
        stage:      config.stage,
        region:     config.region,
        paths:      [
          'nodejscomponent/group1/function1#dynamodb'
        ]
      };

      serverless.actions.eventDeploy(event)
        .then(function(evt) {
          validateEvent(evt);
          done();
        })
        .catch(e => {
          done(e);
        });
    });
  });

  describe('Event Deploy: S3', function() {
    it('should deploy S3 based event source', function(done) {

      this.timeout(0);

      let event = {
        stage:      config.stage,
        region:     config.region,
        paths:      [
          'nodejscomponent/group1/function1#schedule'
        ]
      };

      serverless.actions.eventDeploy(event)
        .then(function(evt) {
          validateEvent(evt);
          done();
        })
        .catch(e => {
          done(e);
        });
    });
  });

  describe('Event Deploy: SNS', function() {
    it('should deploy SNS based event source', function(done) {

      this.timeout(0);

      let event = {
        stage:      config.stage,
        region:     config.region,
        paths:      [
          'nodejscomponent/group1/function1#sns'
        ]
      };

      serverless.actions.eventDeploy(event)
        .then(function(evt) {
          validateEvent(evt);
          done();
        })
        .catch(e => {
          done(e);
        });
    });
  });

  describe('Event Deploy: Scheduled', function() {
    it('should deploy schedule based event source', function(done) {

      this.timeout(0);

      let event = {
        stage:      config.stage,
        region:     config.region,
        paths:      [
          'nodejscomponent/group1/function1#s3'
        ]
      };

      serverless.actions.eventDeploy(event)
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