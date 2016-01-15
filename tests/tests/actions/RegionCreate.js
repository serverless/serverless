
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

let cleanup = function(Meta, cb) {

  AWS.config.update({
    region:          Meta.variables.projectBucket.split('.')[1],
    accessKeyId:     config.awsAdminKeyId,
    secretAccessKey: config.awsAdminSecretKey,
  });

  let s3 = new AWS.S3();

  let params = {
    Bucket: Meta.variables.projectBucket,
    Delete: {
      Objects: [{
      Key: `${Meta.variables.projectBucket}/serverless/${Meta.variables.project}/${config.stage}/${config.region2}/`
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
        .then(projPath => {
          this.timeout(0);
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

      let evt = {
        options: {
          stage:      config.stage,
          region:     config.region2
        }
      };

      serverless.actions.regionCreate(evt)
          .then(function(evt) {

            let Meta = serverless.state.meta;
            //console.log(serverless.state.meta.stages)
            assert.equal(true, typeof Meta.stages[config.stage].regions[config.region2].variables.region != 'undefined');

            // Validate Event
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
