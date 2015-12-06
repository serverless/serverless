'use strict';

/**
 * Test: Stage Create Action
 */

let Serverless      = require('../../../lib/Serverless.js'),
    path      = require('path'),
    utils     = require('../../../lib/utils/index'),
    assert    = require('chai').assert,
    testUtils = require('../../test_utils'),
    os        = require('os'),
    AWS       = require('aws-sdk'),
    config    = require('../../config');

let serverless;

/**
 * Validate Event
 * - Validate an event object's properties
 */

let validateEvent = function(evt) {
  assert.equal(true, typeof evt.region != 'undefined');
  assert.equal(true, typeof evt.noExeCf != 'undefined');
  assert.equal(true, typeof evt.stage != 'undefined');
  assert.equal(true, typeof evt.regionBucket != 'undefined');

  if (!config.noExecuteCf) {
    assert.equal(true, typeof evt.iamRoleLambdaArn != 'undefined');
    assert.equal(true, typeof evt.stageCfStack != 'undefined');
  }
};

/**
 * Test Cleanup
 * - Remove Stage CloudFormation Stack
 */

let cleanup = function(evt, cb) {

  let cloudformation = new AWS.CloudFormation({
    region:          evt.region,
    accessKeyId:     config.awsAdminKeyId,
    secretAccessKey: config.awsAdminSecretKey,
  });
  cloudformation.deleteStack({
    StackName: evt.stageCfStack
  }, function(err, data) {
    if (err) console.log(err, err.stack); // an error occurred
    return cb();
  });
};

describe('Test Action: Stage Create', function() {

  before(function(done) {
    this.timeout(0);

    testUtils.createTestProject(config)
        .then(projPath => {

          this.timeout(0);
          process.chdir(projPath);

          serverless = new Serverless({
            interactive: false,
            awsAdminKeyId:     config.awsAdminKeyId,
            awsAdminSecretKey: config.awsAdminSecretKey
          });

          done();
        });
  });

  describe('Stage Create', function() {
    it('should create stage', function(done) {

      this.timeout(0);

      let event = {
        stage:      config.stage2,
        region:     config.region,
        noExeCf:    config.noExecuteCf,
      };

      serverless.actions.stageCreate(event)
          .then(function(evt) {

            // Validate Event
            validateEvent(evt);

            // Cleanup
            cleanup(evt, done);
          })
          .catch(e => {
            done(e);
          });
    });
  });
});
