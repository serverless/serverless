
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
let projPathGlobal;
/**
 * Validate Event
 * - Validate an event object's properties
 */

let validateEvent = function(options) {
  assert.equal(true, typeof options.region != 'undefined');
  assert.equal(true, typeof options.noExeCf != 'undefined');
  assert.equal(true, typeof options.stage != 'undefined');
};

/**
 * Test Cleanup
 * - Remove Stage CloudFormation Stack
 */

let cleanup = function(options, cb) {

  if (config.noExecuteCf) return cb();

  AWS.config.update({
    region:          options.projectBucket.split('.')[1],
    accessKeyId:     config.awsAdminKeyId,
    secretAccessKey: config.awsAdminSecretKey,
  });

  // Delete Region Bucket
  let s3 = new AWS.S3();

  // Delete All Objects in Bucket first, this is required
  s3.listObjects({
    Bucket: options.projectBucket
  }, function(err, data) {
    if (err) console.log(err);

    let params = {
      Bucket: options.projectBucket
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
        Bucket: options.projectBucket
      }, function (err, data) {
        if (err) console.log(err, err.stack); // an error occurred

        if (config.noExecuteCf) return cb();

        // Delete CloudFormation Resources Stack
        let cloudformation = new AWS.CloudFormation();
        cloudformation.deleteStack({
          StackName: options.stageCfStack
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
          projPathGlobal = projPath;
          process.chdir(projPath);  // Ror some weird reason process.chdir adds /private/ before cwd path

          serverless = new Serverless({
            interactive: false,
            awsAdminKeyId:     config.awsAdminKeyId,
            awsAdminSecretKey: config.awsAdminSecretKey,
            projectPath: projPath
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

      let options = {
        stage:      config.stage,
        region:     config.region2,
        noExeCf:    config.noExecuteCf,
      };

      serverless.actions.regionCreate(options)
          .then(function(options) {

            let Meta = new serverless.classes.Meta(serverless);
            options.options.projectBucket = Meta.data.private.variables.projectBucket;
            options.options.stageCfStack  = Meta.data.private.stages[options.options.stage].regions[options.options.region];


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
