'use strict';

/**
 * Test: Resources Deploy Action
 * - Creates a new project in your system's temp directory
 * - Makes a tiny update to the project's CF template
 * - Deploy new CF template
 * - Deploy/Rollback the original CF template for cleaning
 */

let Serverless = require('../../../lib/Serverless.js'),
    path       = require('path'),
    utils      = require('../../../lib/utils/index'),
    assert     = require('chai').assert,
    testUtils  = require('../../test_utils'),
    SUtils     = require('../../../lib/utils/index'),
    sleep      = require('sleep'),
    fs         = require('fs'),
    config     = require('../../config');

let serverless;
let globalProjPath;

/**
 * Validate Event
 * - Validate an event object's properties
 */

let validateEvent = function(evt) {
  
  assert.equal(true, typeof evt.region != 'undefined');
  assert.equal(true, typeof evt.stage != 'undefined');

};

describe('Test action: Resources Deploy', function() {

  before(function(done) {
    this.timeout(0);
    testUtils.createTestProject(config)
        .then(projPath => {
          process.chdir(projPath);
          serverless = new Serverless({
            interactive: false,
            awsAdminKeyId:     config.awsAdminKeyId,
            awsAdminSecretKey: config.awsAdminSecretKey
          });
          
          globalProjPath = projPath;
          let CfTemplatePath = path.join(projPath, 'cloudformation', 'resources-cf.json');
          let CfTemplateJson = SUtils.readAndParseJsonSync(CfTemplatePath);
          
          CfTemplateJson.Resources.testBucket = { "Type" : "AWS::S3::Bucket" };
          
          
          fs.writeFileSync(CfTemplatePath, JSON.stringify(CfTemplateJson, null, 2));
          
          done();
        });
  });

  after(function(done) {
    done();
  });

  describe('Resources Deploy positive tests', function() {

    it('deploys an updated CF template', function(done) {
      this.timeout(0);
      let event = {
        stage:      config.stage,
        region:     config.region,
      };

      serverless.actions.resourcesDeploy(event)
          .then(function(evt) {

            // Validate Event
            validateEvent(evt);
            
            SUtils.sDebug('Rolling back to the origin CF template');
            // roll back
            let CfTemplatePath = path.join(globalProjPath, 'cloudformation', 'resources-cf.json');
            let CfTemplateJson = SUtils.readAndParseJsonSync(CfTemplatePath);
            
            delete CfTemplateJson.Resources.testBucket;
            
            
            fs.writeFileSync(CfTemplatePath, JSON.stringify(CfTemplateJson, null, 2));
            
            serverless.actions.resourcesDeploy(evt)
                .then(function(evt) {
                  
                  // Validate Event
                  validateEvent(evt);
                  done();
                });
            
            
          })
          .catch(e => {
            done(e);
          });
    });
  });
});
