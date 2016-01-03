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

let validateEvent = function(Meta) {
  assert.equal(true, typeof Meta.data.private.stages[config.stage2].variables.stage != 'undefined');
  assert.equal(true, typeof Meta.data.private.stages[config.stage2].regions[config.region].variables.region != 'undefined');
};

/**
 * Test Cleanup
 * - Remove Stage CloudFormation Stack
 */

let cleanup = function(Meta, cb) {

  AWS.config.update({
    region:          Meta.data.private.variables.projectBucket.split('.')[1],
    accessKeyId:     config.awsAdminKeyId,
    secretAccessKey: config.awsAdminSecretKey,
  });

  let s3 = new AWS.S3();

  let params = {
    Bucket: Meta.data.private.variables.projectBucket,
    Delete: {
      Objects: [{
        Key: `${Meta.data.private.variables.projectBucket}/serverless/${Meta.data.private.variables.project}/${config.stage2}/`
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
        region:     config.region
      };

      serverless.actions.stageCreate(options)
          .then(function(options) {
            let Meta = new serverless.classes.Meta(serverless);

            // Validate Event
            validateEvent(Meta);

            // Cleanup
            cleanup(Meta, done);
          })
          .catch(e => {
            done(e);
          });
    });
  });
});
