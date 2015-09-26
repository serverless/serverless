'use strict';

/**
 * JAWS Test: Dash Command
 */

var Jaws = require('../../lib/index.js'),
    CMDdash = require('../../lib/commands/dash'),
    CMDtag = require('../../lib/commands/tag'),
    JawsError = require('../../lib/jaws-error'),
    testUtils = require('../test_utils'),
    Promise = require('bluebird'),
    path = require('path'),
    assert = require('chai').assert;

var config = require('../config'),
    projPath,
    JAWS;

describe('Test "dash" command', function() {

  before(function(done) {
    this.timeout(0);

    // Tag All Lambdas & Endpoints
    testUtils.createTestProject(
            config.name,
            config.region,
            config.stage,
            config.iamRoleArnLambda,
            config.iamRoleArnApiGateway,
            config.usEast1Bucket,
            ['back/aws_modules/jaws-core-js',
              'back/aws_modules/bundle/browserify',
              'back/aws_modules/bundle/nonoptimized'])
        .then(function(pp) {
          projPath = pp;
          process.chdir(path.join(projPath, 'back'));
          JAWS = new Jaws();
        })
        .then(function() {
          return CMDtag.tagAll(JAWS, 'lambda');
        })
        .then(function() {
          return CMDtag.tagAll(JAWS, 'endpoint');
        })
        .then(function() {
          done();
        });
  });

  describe('Positive tests', function() {
    it('Dash deployment via tagged resources', function(done) {
      this.timeout(0);

      CMDdash.run(JAWS, config.stage, config.region, true)
          .then(function() {
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