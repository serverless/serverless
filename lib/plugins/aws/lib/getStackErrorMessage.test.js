'use strict';

const expect = require('chai').expect;
const Serverless = require('../../../Serverless');
const AwsProvider = require('../provider/awsProvider');
const CLI = require('../../../classes/CLI');
const getStackErrorMessage = require('./getStackErrorMessage');

describe('#getStackErrorMessage()', () => {
  let serverless;
  let awsPlugin;

  beforeEach(() => {
    serverless = new Serverless();
    awsPlugin = {};
    const options = {
      stage: 'dev',
      region: 'us-east-1',
    };
    awsPlugin.serverless = serverless;
    awsPlugin.provider = new AwsProvider(serverless, options);
    awsPlugin.serverless.cli = new CLI(serverless);
    awsPlugin.options = options;
  });

  it('should return a formatted error message', () => {
    const stackLatestError = {
      LogicalResourceId: 'SomeLogicalResourceId',
      ResourceStatusReason: 'Some error message',
    };
    const msg = getStackErrorMessage(stackLatestError, awsPlugin);

    expect(msg).to.equal('An error occurred: SomeLogicalResourceId - Some error message.');
  });

  describe('when X-Ray Tracing deployments cause errors', () => {
    it('should return a custom error message if Deployment resource causes an error', () => {
      const stackLatestError = {
        LogicalResourceId: awsPlugin.provider.naming
          .generateApiGatewayDeploymentLogicalId(awsPlugin.serverless.instanceId),
        ResourceStatusReason: 'StageName',
      };
      const msg = getStackErrorMessage(stackLatestError, awsPlugin);

      expect(msg).to.match(/API Gateway X-Ray Tracing/);
    });

    it('should return a custom error message if Stage resource causes an error', () => {
      const stackLatestError = {
        LogicalResourceId: awsPlugin.provider.naming
          .getStageLogicalId(),
        ResourceStatusReason: 'already exists',
      };
      const msg = getStackErrorMessage(stackLatestError, awsPlugin);

      expect(msg).to.match(/API Gateway X-Ray Tracing/);
    });
  });
});
