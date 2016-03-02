'use strict';

/**
 * Test: Project Install Action
 * - Creates a new private in your system's temp directory
 * - Deletes the CF stack created by the private
 */

let Serverless  = require('../../../lib/Serverless'),
  SError      = require('../../../lib/Error'),
  path        = require('path'),
  os          = require('os'),
  AWS         = require('aws-sdk'),
  uuid        = require('node-uuid'),
  utils       = require('../../../lib/utils/new'),
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
  assert.equal(true, typeof evt.options.domain !== 'undefined');
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

let cleanup = function(project, cb) {

  // Project Create no longer creates a Project Bucket if noExeCf is set
  if (evt.options.noExeCf) return cb();

  AWS.config.update({
    region:          project.getVariables().projectBucketRegion,
    accessKeyId:     config.awsAdminKeyId,
    secretAccessKey: config.awsAdminSecretKey
  });

  // Delete Region Bucket
  let s3 = new AWS.S3();

  // Delete All Objects in Bucket first, this is required
  s3.listObjects({
    Bucket: project.getVariables().projectBucket
  }, function(err, data) {
    if (err) return console.log(err);

    let params = {
      Bucket: project.getVariables().projectBucket
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
        Bucket: project.getVariables().projectBucket
      }, function (err, data) {
        if (err) console.log(err, err.stack); // an error occurred

        // Delete CloudFormation Resources Stack
        let cloudformation = new AWS.CloudFormation();
        cloudformation.deleteStack({
          StackName: project.getRegion(config.stage, config.region).getVariables().resourcesStackName
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

describe('Test action: Project Install', function() {

  before(function(done) {
    process.chdir(os.tmpdir());

    serverless.init().then(function(){
      done();
    });
  });

  after(function(done) {
    done();
  });

  describe('Project Install', function() {
    it('should install an existing project in temp directory', function(done) {

      this.timeout(0);

      let name    = ('testprj-' + uuid.v4()).replace(/-/g, '');
      let domain  = name + '.com';
      let evt   = {
        options: {
          name:               name,
          domain:             domain,
          stage:              config.stage,
          region:             config.region,
          profile:            config.profile,
          noExeCf:            config.noExecuteCf,
          project:            'serverless-starter'
        }
      };

      serverless.actions.projectInstall(evt)
        .then(function(evt) {

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

          evt.options.noExeCf ? done() : cleanup(serverless, done);

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
