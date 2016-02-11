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
  assert.equal(true, typeof evt.options.region !== 'undefined');
  assert.equal(true, typeof evt.options.stage !== 'undefined');
  assert.equal(true, typeof evt.data !== 'undefined');
};


/**
 * Test Cleanup
 * - Remove Stage CloudFormation Stack
 */

let cleanup = function(Meta, cb) {

  AWS.config.update({
    region:          Meta.variables.projectBucket.split('.')[1],
    accessKeyId:     config.awsAdminKeyId,
    secretAccessKey: config.awsAdminSecretKey
  });

  let s3 = new AWS.S3();

  let params = {
    Bucket: Meta.variables.projectBucket,
    Delete: {
      Objects: [{
        Key: `${Meta.variables.projectBucket}/serverless/${Meta.variables.project}/${config.stage2}/`
      }]
    }
  };

  s3.deleteObjects(params, function(err, data) {
    if (err) return console.log(err);
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

  describe('Stage Create', function() {
    it('should create stage', function(done) {

      this.timeout(0);

      let evt = {
        options: {
          stage:      config.stage2,
          region:     config.region,
          noExeCf:    config.noExecuteCf
        }
      };

      serverless.actions.stageCreate(evt)
          .then(function(evt) {

            let Meta = serverless.state.meta;
            assert.equal(true, typeof Meta.stages[config.stage2].variables.stage != 'undefined');
            assert.equal(true, typeof Meta.stages[config.stage2].regions[config.region].variables.region != 'undefined');

            // Validate EVT
            validateEvent(evt);

            // Cleanup
            cleanup(Meta, done);
          })
          .catch(e => {
            done(e);
          });
    });
  });
});
