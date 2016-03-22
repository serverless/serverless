'use strict';

/**
 * Test: Function Deploy Action
 */

let Serverless  = require('../../../lib/Serverless.js'),
  path        = require('path'),
  utils       = require('../../../lib/utils/index'),
  assert      = require('chai').assert,
  testUtils   = require('../../test_utils'),
  AWS         = require('aws-sdk'),
  config      = require('../../config');

let serverless;

/**
 * Validate Event
 * - Validate an event object's properties
 */

let validateEvent = function(evt) {
  assert.equal(true, typeof evt.options.stage != 'undefined');
  assert.equal(true, typeof evt.options.region != 'undefined');
  assert.equal(true, typeof evt.options.functionAlias != 'undefined');
  assert.equal(true, typeof evt.options.names != 'undefined');

  if (evt.data.failed) {
    for (let i = 0; i < Object.keys(evt.data.failed).length; i++) {
      console.log(Object.keys(evt.data.failed)[i]);
      console.log(evt.data.failed[Object.keys(evt.data.failed)[i]]);
    }
  }
  assert.equal(true, typeof evt.data.failed === 'undefined');
  assert.equal(true, typeof evt.data.deployed != 'undefined');
};

/**
 * Test Cleanup
 * - Remove Event Source mapping
 */

let cleanup = function(UUID, cb) {
  let awsConfig = {
    region:          config.region,
    accessKeyId:     config.awsAdminKeyId,
    secretAccessKey: config.awsAdminSecretKey
  };

  let lambda = new AWS.Lambda(awsConfig);

  let params = {
    UUID: UUID
  };

  lambda.deleteEventSourceMapping(params, function(e, data) {
    if (e) {
      cb(e)
    } else {
      cb()
    }
  });
};

/**
 * Create Test Project
 */

describe('Test Action: Function Deploy', function() {

  before(function(done) {
    this.timeout(0);

    testUtils.createTestProject(config, ['functions'])
      .then(projectPath => {

        process.chdir(projectPath);

        serverless = new Serverless({
          projectPath,
          interactive: false,
          awsAdminKeyId:     config.awsAdminKeyId,
          awsAdminSecretKey: config.awsAdminSecretKey
        });

        return serverless.init().then(function() {
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

  describe('Function Deploy: Specify One Path', function() {
    it('should deploy functions', function(done) {

      this.timeout(0);

      let options = {
        stage:      config.stage,
        region:     config.region,
        names:      [
          'function1'
        ]
      };

      serverless.actions.functionDeploy(options)
        .then(function(evt) {
          validateEvent(evt);
          done();
        })
        .catch(e => {
          done(e);
        });
    });
  });

  describe('Function Deploy: Nested W/ Custom Name & Limited Parent Dir', function() {
    it('should deploy functions', function(done) {

      this.timeout(0);

      let options = {
        stage:      config.stage,
        region:     config.region,
        names:      [
          'function4'
        ]
      };

      serverless.actions.functionDeploy(options)
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
