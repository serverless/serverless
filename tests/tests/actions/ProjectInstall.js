'use strict';

/**
 * Test: Project Install Action
 * - Creates a new private in your system's temp directory
 * - Deletes the CF stack created by the private
 */

const Serverless = require('../../../lib/Serverless'),
  BbPromise = require('bluebird'),
  os        = require('os'),
  AWS       = require('aws-sdk'),
  uuid      = require('node-uuid'),
  assert    = require('chai').assert,
  config    = require('../../config');

// Instantiate
let serverless = new Serverless({
  interactive: false,
  awsAdminKeyId: config.awsAdminKeyId,
  awsAdminSecretKey: config.awsAdminSecretKey
});

/**
 * Validate Event
 * - Validate an event object's properties
 */

let validateEvent = function(evt) {
  assert.isDefined(evt.options.name);
  assert.isDefined(evt.options.region);
  assert.isDefined(evt.options.noExeCf);
  assert.isDefined(evt.options.stage);
  assert.isDefined(evt.data);
};

/**
 * Test Cleanup
 * - Remove Stage CloudFormation Stack
 */

const cleanup = () => {
  if(config.noExecuteCf) return;

  AWS.config.update({
    region:          config.region,
    accessKeyId:     config.awsAdminKeyId,
    secretAccessKey: config.awsAdminSecretKey
  });

  const cloudformation = new AWS.CloudFormation();

  const StackName = serverless.getProject()
    .getRegion(config.stage, config.region)
    .getVariables().resourcesStackName;

  return BbPromise.fromCallback(cb => cloudformation.deleteStack({StackName}, cb));
};

/**
 * Tests
 */

describe('Test action: Project Install', function() {
  this.timeout(0);

  before(() => {
    process.chdir(os.tmpdir());
    return serverless.init();
  });

  after(cleanup);

  describe('Project Install', () => {

    it('should install an existing project in temp directory', () => {

      const name = ('testprj-' + uuid.v4()).replace(/-/g, '');

      const evt = {
        options: {
          name:    name,
          stage:   config.stage,
          region:  config.region,
          profile: config.profile_development,
          noExeCf: config.noExecuteCf,
          project: 'serverless-starter'
        }
      };

      return serverless.actions.projectInstall(evt)
        .then((evt) => {

          const project = serverless.getProject();
          const stage   = project.getStage(config.stage);
          const region  = project.getRegion(config.stage, config.region);

          assert.isDefined(project.getVariables().project);

          assert.isDefined(stage.getVariables().stage);
          assert.isDefined(region.getVariables().region);

          if (!config.noExecuteCf) {
            assert.isDefined(region.getVariables().iamRoleArnLambda);
            assert.isDefined(region.getVariables().resourcesStackName);
          }

          // Validate Event
          validateEvent(evt);
        });
    });
  });
});
