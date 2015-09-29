'use strict';

/**
 * JAWS Test: Dash Command
 */

var Jaws = require('../../lib/index.js'),
    CmdNewStageRegion = require('../../lib/commands/new_stage_region'),
    JawsError = require('../../lib/jaws-error'),
    testUtils = require('../test_utils'),
    utils = require('../../lib/utils'),
    Promise = require('bluebird'),
    path = require('path'),
    shortid = require('shortid'),
    assert = require('chai').assert;

var config = require('../config'),
    projPath,
    JAWS;

var tempStage = 'temp-' + shortid.generate();
var usEast1Region = 'us-east-1';
var euWest1Region = 'eu-west-1';

describe('Test "new stage/region" command', function() {

  before(function(done) {
    this.timeout(0);

    return testUtils.createTestProject(
        config.name,
        config.stage,
        config.region,
        config.domain,
        config.iamRoleArnLambda,
        config.iamRoleArnApiGateway)
        .then(function(pp) {
          projPath = pp;
          process.chdir(projPath);
          JAWS = new Jaws();
          done();
        });
  });

  describe('Positive tests', function() {

    it('Create New Stage', function(done) {
      this.timeout(0);

      CmdNewStageRegion.run(JAWS, 'stage', tempStage, usEast1Region, config.usEast1Bucket, config.noExecuteCf)
          .then(function() {
            var jawsJson = utils.readAndParseJsonSync(path.join(process.cwd(), '../jaws.json'));
            var region = false;
            for (var i = 0; i < jawsJson.stages[tempStage].length; i++) {
              var stage = jawsJson.stages[tempStage][i];
              console.log(jawsJson.stages[tempStage][i]);
              if (stage.region === usEast1Region) {
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

      CmdNewStageRegion.run(JAWS, 'region', tempStage, euWest1Region, config.euWest1Bucket, config.noExecuteCf)
          .then(function() {
            var jawsJson = utils.readAndParseJsonSync(path.join(process.cwd(), '../jaws.json'));
            var region = false;
            for (var i = 0; i < jawsJson.stages[tempStage].length; i++) {
              var stage = jawsJson.stages[tempStage][i];
              if (stage.region === euWest1Region) {
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