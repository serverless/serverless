
'use strict';

/**
 * Test: Region Create Action
 */

let Serverless    = require('../../../lib/Serverless'),
    path          = require('path'),
    utils         = require('../../../lib/utils/index'),
    assert        = require('chai').assert,
    testUtils     = require('../../test_utils'),
    os            = require('os'),
    AWS           = require('aws-sdk'),
    config        = require('../../config');

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
    secretAccessKey: config.awsAdminSecretKey,
  });

  let s3 = new AWS.S3();

  let params = {
    Bucket: project.getVariables().projectBucket,
    Delete: {
      Objects: [{
      Key: `${project.getVariables().projectBucket}/serverless/${project.getVariables().project}/${config.stage}/${config.region2}/`
      }]
    }
  };

  s3.deleteObjects(params, function(err, data) {
    if (err) return console.log(err);
    return cb();
  });
};

/**
 * Tests
 */

describe('Test Action: Region Create', function() {

  before(function(done) {
    this.timeout(0);

    testUtils.createTestProject(config)
        .then(projectPath => {
          this.timeout(0);
          process.chdir(projectPath);  // Ror some weird reason process.chdir adds /private/ before cwd path

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

  describe('Region Create', function() {
    it('should create region', function(done) {

      this.timeout(0);

      let evt = {
        options: {
          stage:      config.stage,
          region:     config.region2,
          noExeCf:    config.noExecuteCf
        }
      };

      serverless.actions.regionCreate(evt)
          .then(function(evt) {
            let project = serverless.getProject();
            assert.equal(project.getRegion(config.stage, config.region2).getVariables().region, config.region2);


            // Validate Event
            validateEvent(evt);

            // Cleanup
            cleanup(project, done);
          })
          .catch(e => {
            done(e);
          });
    });
  });
});
