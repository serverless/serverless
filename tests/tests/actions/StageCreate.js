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

let cleanup = function(project, cb) {

  AWS.config.update({
    region:          project.getVariables().projectBucketRegion,
    accessKeyId:     config.awsAdminKeyId,
    secretAccessKey: config.awsAdminSecretKey
  });

  let s3 = new AWS.S3();

  let params = {
    Bucket: project.getVariables().projectBucket,
    Delete: {
      Objects: [{
        Key: `${project.getVariables().projectBucket}/serverless/${project.getVariables().project}/${config.stage2}/`
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
        .then(projectPath => {

          this.timeout(0);
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

  describe('Stage Create', function() {
    it('should create stage', function(done) {

      this.timeout(0);

      let evt = {
        options: {
          stage:      config.stage2,
          region:     config.region,
          profile:    config.profile_production,
          noExeCf:    config.noExecuteCf
        }
      };

      return serverless.actions.stageCreate(evt)
          .then(function(evt) {
            let project = serverless.getProject();
            assert.equal(project.getStage(config.stage2).getVariables().stage, config.stage2);
            assert.equal(project.getRegion(config.stage2, config.region).getVariables().region, config.region);

            // Validate EVT
            validateEvent(evt);

            // Cleanup
            evt.options.noExeCf ? done() : cleanup(project, done);

          })
          .catch(e => {
            done(e);
          });
    });
  });
});
