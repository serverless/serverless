
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

  AWS.config.update({
    region:          config.region2,
    accessKeyId:     config.awsAdminKeyId,
    secretAccessKey: config.awsAdminSecretKey,
  });

  // Delete Region Bucket
  let s3 = new AWS.S3();

  // Delete All Objects in Bucket first, this is required
  s3.listObjects({
    Bucket: evt.regionBucket
  }, function(err, data) {
    if (err) console.log(err);

    let params = {
      Bucket: evt.regionBucket
    };
    params.Delete = {};
    params.Delete.Objects = [];

    data.Contents.forEach(function(content) {
      params.Delete.Objects.push({Key: content.Key});
    });
    s3.deleteObjects(params, function(err, data) {
      if (err) return console.log(err);

      // Delete Bucket
      s3.deleteBucket({
        Bucket: evt.regionBucket
      }, function (err, data) {
        if (err) console.log(err, err.stack); // an error occurred

        if (!evt.stageCfStack) return cb();

        // Delete CloudFormation Resources Stack
        let cloudformation = new AWS.CloudFormation();
        cloudformation.deleteStack({
          StackName: evt.stageCfStack
        }, function (err, data) {
          if (err) console.log(err, err.stack); // an error occurred

          return cb();
        });
      });
    });
  });
};

/**
 * Tests
 */

describe('Test Action: Region Create', function() {

  before(function(done) {
    this.timeout(0);

    testUtils.createTestProject(config)
        .then(projPath => {
          this.timeout(0);

          process.chdir(projPath);  // Ror some weird reason process.chdir adds /private/ before cwd path

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

  describe('Region Create', function() {
    it('should create region', function(done) {

      this.timeout(0);

      let event = {
        stage:      config.stage,
        region:     config.region2,
        noExeCf:    config.noExecuteCf,
      };

      serverless.actions.regionCreate(event)
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
