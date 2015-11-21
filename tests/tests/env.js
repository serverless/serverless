'use strict';

/**
 * JAWS Test: ENV Command
 */

let Jaws = require('../../lib/index.js'),
    JawsEnv = require('../../lib/commands/JawsEnv'),
    testUtils = require('../test_utils'),
    path = require('path'),
    assert = require('chai').assert;

let config = require('../config'),
    projPath,
    JAWS;

describe('Test "env" command', function() {

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
          process.chdir(path.join(projPath, 'slss_modules', 'sessions', 'show'));
          JAWS = new Jaws();
          done();
        });
  });

  after(function(done) {
    done();
  });

  describe('Positive tests', function() {
    it('Test env command', function(done) {
      this.timeout(0);

      let CmdEnv = new JawsEnv(JAWS, config.stage, config.region);

      CmdEnv.listEnv()
          .then(function(d) {
            done();
          })
          .error(function(e) {
            done(e);
          });
    });
  });
});