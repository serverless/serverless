'use strict';

/**
 * JAWS Test: New Action Command
 */

let Jaws = require('../../lib/index.js'),
    CmdNewAction = require('../../lib/commands/ModuleCreateCmd'),
    JawsError = require('../../lib/jaws-error'),
    testUtils = require('../test_utils'),
    Promise = require('bluebird'),
    path = require('path'),
    assert = require('chai').assert;

let config = require('../config'),
    projPath,
    JAWS;

describe('Test "new module" command', function() {

  before(function(done) {
    this.timeout(0);
    testUtils.createTestProject(
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

    it('Test "new module" command', function(done) {
      this.timeout(0);

      let module = {
        type: 'both',
        name: 'users',
        action: 'list',
        runtime: 'nodejs',
        pkgMgr: false,
      };

      CmdNewAction.run(JAWS, module.name, module.action, module.runtime, module.pkgMgr, module.type)
          .then(function() {
            let jawsJson = require(path.join(process.cwd(), 'aws_modules/users/list/awsm.json'));
            assert.isTrue(typeof jawsJson.lambda.cloudFormation !== 'undefined');
            assert.isTrue(typeof jawsJson.apiGateway.cloudFormation !== 'undefined');
            assert.isTrue(jawsJson.apiGateway.cloudFormation.Path === 'users/list');
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
