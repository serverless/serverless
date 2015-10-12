'use strict';

/**
 * JAWS Test: Deploy Endpoint
 */

let Jaws = require('../../lib/index.js'),
    CmdDeployEndpoints = require('../../lib/commands/DeployEndpoint'),
    Tag = require('../../lib/commands/Tag'),
    JawsError = require('../../lib/jaws-error'),
    testUtils = require('../test_utils'),
    Promise = require('bluebird'),
    path = require('path'),
    assert = require('chai').assert,
    config = require('../config'),
    lambdaPaths = {},
    projPath,
    JAWS;

describe('Test deploy endpoint command', function() {

  before(function(done) {
    testUtils.createTestProject(
        config.name,
        config.stage,
        config.region,
        config.domain,
        config.iamRoleArnLambda,
        config.iamRoleArnApiGateway)
        .then(function(pp) {
          projPath = pp;
          process.chdir(path.join(projPath, 'aws_modules/sessions/show'));
          JAWS = new Jaws();

          // Get Lambda Paths
          lambdaPaths.lambda1 = path.join(projPath, 'aws_modules', 'sessions', 'show', 'awsm.json');
          lambdaPaths.lambda2 = path.join(projPath, 'aws_modules', 'sessions', 'create', 'awsm.json');
          lambdaPaths.lambda3 = path.join(projPath, 'aws_modules', 'users', 'create', 'awsm.json');
        })
        .then(function() {
          let CmdTag = new Tag(JAWS, 'endpoint')
          return CmdTag.tagAll(false);
        }).then(done);
  });

  describe('Positive tests', function() {

    it('Deploy REST API', function(done) {

      this.timeout(0);

      CmdDeployEndpoints.run(JAWS, config.stage, config.region, true)
          .then(function() {
            done();
          })
          .catch(JawsError, function(e) {
            done(e);
          })
          .error(function(e) {
            console.log(e);
            done(e);
          });
    });

    it('Check awsm.json files were untagged', function(done) {
      assert.equal(false, require(lambdaPaths.lambda1).apiGateway.deploy);
      assert.equal(false, require(lambdaPaths.lambda2).apiGateway.deploy);
      assert.equal(false, require(lambdaPaths.lambda3).apiGateway.deploy);
      done();
    });

    it('Check API ID was added to project\'s jaws.json file', function(done) {

      // Get Region JSON
      let regions = require(path.join(projPath, 'jaws.json'))
          .stages[config.stage.toLowerCase().trim()];
      let region = null;
      for (let i = 0; i < regions.length; i++) {
        if (regions[i].region.toLowerCase().trim() === config.region.toLowerCase().trim()) {
          region = regions[i];
        }
      }

      assert.equal(true, typeof region !== 'undefined');
      assert.equal(true, typeof region.restApiId !== 'undefined');
      done();
    });
  });
});