'use strict';

const expect = require('chai').expect;
const sinon = require('sinon');
const AwsCompileApigEvents = require('../index');
const Serverless = require('../../../../../../../Serverless');

describe('#compileDeployment()', () => {
  let serverless;
  let awsCompileApigEvents;
  let clock;

  const serviceResourcesAwsResourcesObjectMock = {
    Resources: {},
  };

  beforeEach(() => {
    // Setup a fake timer so timed elements will match
    clock = sinon.useFakeTimers();

    const Resources = {};
    Resources[`DeploymentApigEvent${new Date().getTime()}`] = {
      Type: 'AWS::ApiGateway::Deployment',
      DeletionPolicy: 'Retain',
      Properties: {
        Description: `dev created at ${new Date()}`,
        RestApiId: { Ref: 'RestApiApigEvent' },
        StageName: 'dev',
      },
    };

    // Add the new mocked resource back into the main list
    Object.assign(serviceResourcesAwsResourcesObjectMock.Resources, Resources);

    serverless = new Serverless();
    serverless.service.resources = { Resources: {} };
    const options = {
      stage: 'dev',
      region: 'us-east-1',
    };
    awsCompileApigEvents = new AwsCompileApigEvents(serverless, options);
    awsCompileApigEvents.methodDep = 'method-dependency';
  });

  afterEach(() => {
    clock.restore();
  });

  it('should create a deployment resource', () => awsCompileApigEvents
    .compileDeployment().then(() => {
      expect(
        awsCompileApigEvents.serverless.service.resources.Resources
      ).to.deep.equal(
        serviceResourcesAwsResourcesObjectMock.Resources
      );
    })
  );
});
