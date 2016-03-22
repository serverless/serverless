'use strict';

/**
 * Test: Function Rollback Action
 */

let Serverless  = require('../../../lib/Serverless.js'),
  path        = require('path'),
  utils       = require('../../../lib/utils/index'),
  assert      = require('chai').assert,
  testUtils   = require('../../test_utils'),
  AWS         = require('aws-sdk'),
  BbPromise   = require('bluebird'),
  _           = require('lodash'),
  config      = require('../../config');

let serverless, rollbackFrom, rollbackTo;

/**
 * Create Test Project
 */

const stage  = config.stage,
      region = config.region;

describe('Test Action: Function Rollback', function() {
  this.timeout(0);

  before(function() {
    return testUtils.createTestProject(config, ['functions'])
      .then(projectPath => {
        process.chdir(projectPath);

        serverless = new Serverless({
          projectPath,
          interactive: false,
          awsAdminKeyId:     config.awsAdminKeyId,
          awsAdminSecretKey: config.awsAdminSecretKey
        });

        return serverless.init()
      })
      .then(() => {
        const FunctionName = serverless
          .getProject()
          .getFunction('function1')
          .getDeployedName({stage, region});

        const getDeployed = serverless.getProvider('aws')
          .request('Lambda', 'getFunction', {FunctionName, Qualifier: stage}, stage, region)
          .then((res) => res.Configuration);

        const getVersions = serverless.getProvider('aws')
          .request('Lambda', 'listVersionsByFunction', {FunctionName}, stage, region)
          .then(reply => reply.Versions)

        return BbPromise.all([getDeployed, getVersions]);
      })
      .spread((deployed, versions) => {
        if (versions.length < 3) throw new Error("Need at least two deployed version")
        const Role = serverless.getProject().getRegion(stage, region).getVariables().iamRoleArnLambda;

        rollbackFrom = deployed.Version;

        rollbackTo = _.chain(versions)
          .reject({Version: '$LATEST'})
          .reject({Version: rollbackFrom})
          .filter({Role})
          .sample()
          .value()
          .Version;
      });
  });

  /**
   * Tests
   */

  describe('Function Rollback', function() {
    it('should rollback function', function() {

      let options = {
        stage,
        region,
        name:    'function1',
        version: rollbackTo
      };

      return serverless.actions.functionRollback(options)
        .then((evt) => {
          assert.equal(evt.data.rollbackFrom, rollbackFrom);
          assert.equal(evt.data.rollbackTo, rollbackTo);
        });
    });
  });
});
