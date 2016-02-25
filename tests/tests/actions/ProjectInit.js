'use strict';

/**
 * Test: Project Init Action
 * - Creates a new private in your system's temp directory
 * - Deletes the CF stack created by the private
 */

let Serverless  = require('../../../lib/Serverless'),
  SError      = require('../../../lib/Error'),
  path        = require('path'),
  os          = require('os'),
  AWS         = require('aws-sdk'),
  uuid        = require('node-uuid'),
  utils       = require('../../../lib/utils/index'),
  assert      = require('chai').assert,
  shortid     = require('shortid'),
  config      = require('../../config');

// Instantiate
let serverless = new Serverless( undefined, {
  interactive: false,
  awsAdminKeyId: config.awsAdminKeyId,
  awsAdminSecretKey: config.awsAdminSecretKey
});

/**
 * Validate Event
 * - Validate an event object's properties
 */

let validateEvent = function(evt) {
  assert.equal(true, typeof evt.options.name !== 'undefined');
  assert.equal(true, typeof evt.options.bucket !== 'undefined');
  assert.equal(true, typeof evt.options.notificationEmail !== 'undefined');
  assert.equal(true, typeof evt.options.region !== 'undefined');
  assert.equal(true, typeof evt.options.noExeCf !== 'undefined');
  assert.equal(true, typeof evt.options.stage !== 'undefined');
  assert.equal(true, typeof evt.data !== 'undefined');
};

/**
 * Test Cleanup
 * - Remove Stage CloudFormation Stack
 */

let cleanup = function(Meta, cb, evt) {

  // Project Create no longer creates a Project Bucket if noExeCf is set
  if (evt.options.noExeCf) return cb();

  AWS.config.update({
    region:          config.region,
    accessKeyId:     config.awsAdminKeyId,
    secretAccessKey: config.awsAdminSecretKey
  });

  // Delete Region Bucket
  let s3 = new AWS.S3();

  // Delete All Objects in Bucket first, this is required
  s3.listObjects({
    Bucket: Meta.variables.projectBucket
  }, function(err, data) {
    if (err) return console.log(err);

    let params = {
      Bucket: Meta.variables.projectBucket
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
        Bucket: Meta.variables.projectBucket
      }, function (err, data) {
        if (err) console.log(err, err.stack); // an error occurred

        // If no stack, skip
        if (config.noExecuteCf) return cb();

        // Delete CloudFormation Resources Stack
        let cloudformation = new AWS.CloudFormation();
        cloudformation.deleteStack({
          StackName: serverless.getProject().getRegion(config.stage, config.region)._variables.resourcesStackName
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

describe('Test action: Project Init', function() {

  before(function(done) {
    process.chdir(os.tmpdir());

    serverless.init().then(function(){
      done();
    });
  });

  after(function(done) {
    done();
  });

  describe('Project Init', function() {
    it('should create a new private in temp directory', function(done) {

      this.timeout(0);

      let name    = ('testprj-' + uuid.v4()).replace(/-/g, '');
      let bucket  = name + '.com';
      let evt   = {
        options: {
          name:               name,
          bucket:             bucket,
          notificationEmail:  config.notifyEmail,
          stage:              config.stage,
          region:             config.region,
          profile:            config.profile,
          noExeCf:            config.noExecuteCf
        }
      };

      serverless.actions.projectInit(evt)
        .then(function(evt) {

          // Validate Meta
          let project = serverless.getProject();
          let stage   = project.getStage(config.stage);
          let region  = project.getRegion(config.stage, config.region);

          assert.equal(true, typeof project.getVariables().project != 'undefined');
          assert.equal(true, typeof project.getVariables().projectBucket != 'undefined');
          assert.equal(true, typeof project.getVariables().projectBucketRegion != 'undefined');
          assert.equal(true, typeof stage.getVariables().stage != 'undefined');
          assert.equal(true, typeof region.getVariables().region != 'undefined');
          if (!config.noExecuteCf) {
            assert.equal(true, typeof region.getVariables().iamRoleArnLambda != 'undefined');
            assert.equal(true, typeof region.getVariables().resourcesStackName != 'undefined');

          }

          // Validate Event
          validateEvent(evt);
          done();

          // Cleanup
          //cleanup(serverless, done, evt);

        })
        .catch(SError, function(e) {
          done(e);
        })
        .error(function(e) {
          done(e);
        });
    });
  });
});
