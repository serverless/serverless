'use strict';

/**
 * Test: Resources Diff Action
 * - Creates a new private in your system's temp directory
 * - Makes a tiny update to the private's CF template
 * - Deploy new CF template
 * - Makes a diff object from the local and deployed template versions
 */

const Serverless = require('../../../lib/Serverless.js'),
  assert         = require('chai').assert,
  testUtils      = require('../../test_utils'),
  SUtils         = require('../../../lib/utils/index'),
  config         = require('../../config');

let serverless,
    testBucketName = 'testBucket' + (new Date).getTime().toString();

/**
 * Validate Event
 * - Validate an event object's properties
 */

const validateEvent = function(evt) {
  assert.equal(true, typeof evt.options.region !== 'undefined');
  assert.equal(true, typeof evt.options.stage !== 'undefined');
  assert.equal(true, typeof evt.data !== 'undefined');
  assert.equal(true, typeof evt.data.difference !== 'undefined');

  let keys = Object.keys(evt.data.difference.Resources);
  assert.equal(true, keys[0].endsWith('__deleted'));
  assert.equal(true, keys[1].endsWith('__added'));
  assert.equal(true, typeof evt.data.difference.Resources[testBucketName + '__added'] !== 'undefined');
};

describe('Test action: Resources Diff', function() {
  this.timeout(0);

  before(function() {

    return testUtils.createTestProject(config)
      .then(projectPath => {

        process.chdir(projectPath);

        serverless = new Serverless({
          projectPath,
          interactive: false,
          awsAdminKeyId:     config.awsAdminKeyId,
          awsAdminSecretKey: config.awsAdminSecretKey
        });

        return serverless.init();
      })
      .then(function() {

        SUtils.sDebug('Adding test bucket resource');


        let defaultResources = serverless.getProject().getResources().toObject();
        defaultResources.Resources[testBucketName] = { "Type" : "AWS::S3::Bucket" };
        serverless.getProject().getResources().fromObject(defaultResources);

      });
  });


  describe('Resources Diff positive tests', function() {

    it('should make a diff of updated CF template', function() {

      const evt = {
        stage:      config.stage,
        region:     config.region
      };

      return serverless.actions.resourcesDiff(evt).then(validateEvent);
    });
  });
});
