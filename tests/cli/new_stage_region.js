'use strict';

/**
 * JAWS Test: Dash Command
 */

var Jaws = require('../../lib/index.js'),
    CmdNewStageRegion = require('../../lib/commands/new_stage_region'),
    JawsError = require('../../lib/jaws-error'),
    testUtils = require('../test_utils'),
    Promise = require('bluebird'),
    path = require('path'),
    shortid = require('shortid'),
    assert = require('chai').assert;

var config = require('../config'),
    projPath,
    JAWS;

var tempStage = 'temp-' + shortid.generate();
var tempRegion1 = 'us-west-1';
var tempRegion2 = 'eu-west-1';

describe('Test "new stage/region" command', function() {

  before(function(done) {
    this.timeout(0);

    // Tag All Lambdas & Endpoints
    return Promise.try(function() {

      // Create Test Project
      projPath = testUtils.createTestProject(
          config.name,
          config.region,
          config.stage,
          config.iamRoleArnLambda,
          config.iamRoleArnApiGateway,
          config.envBucket);
      process.chdir(path.join(projPath, 'back'));

      // Instantiate JAWS
      JAWS = new Jaws();
    })
        .then(function() {
          return done();
        });
  });

  after(function(done) {
    done();
  });

  describe('Positive tests', function() {

    it('Create New Stage', function(done) {
      this.timeout(0);

      CmdNewStageRegion.run(JAWS, 'stage', tempStage, tempRegion1, false)
          .then(function() {
            var jawsJson = require(path.join(process.cwd(), '../jaws.json'));
            var region = false;
            for (var i = 0; i < jawsJson.project.stages[tempStage].length; i++) {
              var stage = jawsJson.project.stages[tempStage][i];
              if (stage.region === tempRegion1) {
                region = stage.region;
              }
            }
            assert.isTrue(region !== false);
            done();
          })
          .catch(JawsError, function(e) {
            done(e);
          })
          .error(function(e) {
            done(e);
          });
    });

    it('Create New region', function(done) {
      this.timeout(0);

      CmdNewStageRegion.run(JAWS, 'region', tempStage, tempRegion2, false)
          .then(function() {
            var jawsJson = require(path.join(process.cwd(), '../jaws.json'));
            var region = false;
            for (var i = 0; i < jawsJson.project.stages[tempStage].length; i++) {
              var stage = jawsJson.project.stages[tempStage][i];
              if (stage.region === tempRegion2) {
                region = stage.region;
              }
            }
            assert.isTrue(region !== false);
            done();
          })
          .catch(JawsError, function(e) {
            done(e);
          })
          .error(function(e) {
            done(e);
          });
    });
  });
});