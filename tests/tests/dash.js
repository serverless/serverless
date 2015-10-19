'use strict';

/**
 * JAWS Test: Dash Command
 */

let Jaws = require('../../lib/index.js'),
    CMDdash = require('../../lib/commands/dash'),
    Tag = require('../../lib/commands/Tag'),
    JawsError = require('../../lib/jaws-error'),
    testUtils = require('../test_utils'),
    Promise = require('bluebird'),
    path = require('path'),
    assert = require('chai').assert;

let config = require('../config'),
    projPath,
    JAWS;

describe('Test "dash" command', function() {

  before(function(done) {
    this.timeout(0);

    // Tag All Lambdas & Endpoints
    testUtils.createTestProject(
        config.name,
        config.stage,
        config.region,
        config.domain,
        config.iamRoleArnLambda,
        config.iamRoleArnApiGateway,
        ['./'])
        .then(function(pp) {
          projPath = pp;
          process.chdir(projPath);
          JAWS = new Jaws();
        })
        .then(function() {
          let CmdTag = new Tag(JAWS, 'lambda')
          return CmdTag.tagAll();
        })
        .then(function() {
          let CmdTag = new Tag(JAWS, 'endpoint')
          return CmdTag.tagAll();
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