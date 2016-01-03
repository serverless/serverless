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

let validateEvent = function(options) {
  assert.equal(true, typeof options.region != 'undefined');
  assert.equal(true, typeof options.noExeCf != 'undefined');
  assert.equal(true, typeof options.stage != 'undefined');

  if (!config.noExecuteCf) {
    assert.equal(true, typeof options.iamRoleLambdaArn != 'undefined');
    assert.equal(true, typeof options.stageCfStack != 'undefined');
  }
};

/**
 * Test Cleanup
 * - Remove Stage CloudFormation Stack
 */

let cleanup = function(options, cb) {

  if (config.noExecuteCf) return cb();

  let cloudformation = new AWS.CloudFormation({
    region:          options.region,
    accessKeyId:     config.awsAdminKeyId,
    secretAccessKey: config.awsAdminSecretKey,
  });
  cloudformation.deleteStack({
    StackName: options.stageCfStack
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
            awsAdminSecretKey: config.awsAdminSecretKey,
            projectPath: projPath
          });

          done();
        });
  });

  describe('Stage Create', function() {
    it('should create stage', function(done) {

      this.timeout(0);

      let options = {
        stage:      config.stage2,
        region:     config.region,
        noExeCf:    config.noExecuteCf,
      };

      serverless.actions.stageCreate(options)
          .then(function(options) {

            // Validate Event
            validateEvent(options.options);

            // Cleanup
            cleanup(options.options, done);
          })
          .catch(e => {
            done(e);
          });
    });
  });
});
