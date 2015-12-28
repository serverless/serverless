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
  awsAdminSecretKey: config.awsAdminSecretKey,
});

/**
 * Test Cleanup
 * - Remove Stage CloudFormation Stack
 */

let cleanup = function(evt, cb) {

  AWS.config.update({
    region:          evt.region,
    accessKeyId:     config.awsAdminKeyId,
    secretAccessKey: config.awsAdminSecretKey,
  });

  // Delete Region Bucket
  let s3 = new AWS.S3();

  // Delete All Objects in Bucket first, this is required
  s3.listObjects({
    Bucket: evt.regionBucket
  }, function(err, data) {
    if (err) return console.log(err);

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

        // If no evt.stageCfStack, skip
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
 * Validate Event
 * - Validate an event object's properties
 */

let validateEvent = function(evt) {
  assert.equal(true, typeof evt.name != 'undefined');
  assert.equal(true, typeof evt.domain != 'undefined');
  assert.equal(true, typeof evt.notificationEmail != 'undefined');
  assert.equal(true, typeof evt.region != 'undefined');
  assert.equal(true, typeof evt.noExeCf != 'undefined');
  assert.equal(true, typeof evt.runtime != 'undefined');
  assert.equal(true, typeof evt.stage != 'undefined');
  assert.equal(true, typeof evt.regionBucket != 'undefined');

  if (!config.noExecuteCf) {
    assert.equal(true, typeof evt.iamRoleLambdaArn != 'undefined');
    assert.equal(true, typeof evt.stageCfStack != 'undefined');
  }
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
      let event   = {
        name:               name,
        domain:             domain,
        notificationEmail:  config.notifyEmail,
        region:             config.region,
        noExeCf:            config.noExecuteCf,
      };

      serverless.actions.projectCreate(event)
          .then(function(evt) {

            // Validate Event
            validateEvent(evt);

            // Validate Project JSON
            let projectJson = utils.readAndParseJsonSync(path.join(os.tmpdir(), name, 's-private.json'));
            let region = false;

            for (let i = 0; i < projectJson.stages.development.length; i++) {
              let stage = projectJson.stages[config.stage][i];
              if (stage.region === config.region) {
                region = stage.region;
              }
            }
            assert.isTrue(region !== false);

            // Cleanup
            cleanup(evt, done);
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
