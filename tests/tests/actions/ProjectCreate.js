'use strict';

/**
 * Test: Project Create Action
 * - Creates a new private in your system's temp directory
 * - Deletes the CF stack created by the private
 */

let Serverless  = require('../../../lib/Serverless'),
    SError      = require('../../../lib/ServerlessError'),
    path        = require('path'),
    os          = require('os'),
    AWS         = require('aws-sdk'),
    uuid        = require('node-uuid'),
    utils       = require('../../../lib/utils/index'),
    assert      = require('chai').assert,
    shortid     = require('shortid'),
    config      = require('../../config');

// Instantiate JAWS
let serverless = new Serverless({
  interactive: false,
  awsAdminKeyId: config.awsAdminKeyId,
  awsAdminSecretKey: config.awsAdminSecretKey
});


/**
 * Validate Event
 * - Validate an event object's properties
 */

let validateEvent = function(Meta) {
  assert.equal(true, typeof Meta.data.private.variables.project != 'undefined');
  assert.equal(true, typeof Meta.data.private.variables.domain != 'undefined');
  assert.equal(true, typeof Meta.data.private.variables.projectBucket != 'undefined');
  assert.equal(true, typeof Meta.data.private.stages[config.stage].variables.stage != 'undefined');
  assert.equal(true, typeof Meta.data.private.stages[config.stage].regions[config.region].variables.region != 'undefined');

  if (!config.noExecuteCf) {
    assert.equal(true, typeof Meta.data.private.stages[config.stage].regions[config.region].variables.iamRoleArnLambda != 'undefined');
    assert.equal(true, typeof Meta.data.private.stages[config.stage].regions[config.region].variables.resourcesStackName != 'undefined');
  }
};

/**
 * Test Cleanup
 * - Remove Stage CloudFormation Stack
 */

let cleanup = function(Meta, cb) {

  AWS.config.update({
    region:          config.region,
    accessKeyId:     config.awsAdminKeyId,
    secretAccessKey: config.awsAdminSecretKey,
  });

  // Delete Region Bucket
  let s3 = new AWS.S3();

  // Delete All Objects in Bucket first, this is required
  s3.listObjects({
    Bucket: Meta.data.private.variables.projectBucket
  }, function(err, data) {
    if (err) return console.log(err);

    let params = {
      Bucket: Meta.data.private.variables.projectBucket
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
        Bucket: Meta.data.private.variables.projectBucket
      }, function (err, data) {
        if (err) console.log(err, err.stack); // an error occurred

        // If no stack, skip
        if (config.noExecuteCf) return cb();

        // Delete CloudFormation Resources Stack
        let cloudformation = new AWS.CloudFormation();
        cloudformation.deleteStack({
          StackName: Meta.data.private.stages[config.stage].regions[config.region].variables.resourcesStackName
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

describe('Test action: Project Create', function() {

  before(function(done) {
    process.chdir(os.tmpdir());
    done();
  });

  after(function(done) {
    done();
  });

  describe('Project Create', function() {
    it('should create a new private in temp directory', function(done) {

      this.timeout(0);

      let name    = ('testprj-' + uuid.v4()).replace(/-/g, '');
      let domain  = name + '.com';
      let evt   = {
        options: {
          name:               name,
          domain:             domain,
          notificationEmail:  config.notifyEmail,
          region:             config.region,
          noExeCf:            config.noExecuteCf,
        }
      };

      serverless.actions.projectCreate(evt)
          .then(function(evt) {
            let Meta = new serverless.classes.Meta(serverless);

            // Validate Event
            validateEvent(Meta);

            // Cleanup
            cleanup(Meta, done);
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
