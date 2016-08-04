'use strict';

const expect = require('chai').expect;
const AwsCompileApigEvents = require('../index');
const Serverless = require('../../../../../../../Serverless');

describe('#compileDeployment()', () => {
  let serverless;
  let awsCompileApigEvents;

  const serviceResourcesAwsResourcesObjectMock = {
    Resources: {
      DeploymentApigEvent: {
        Type: 'AWS::ApiGateway::Deployment',
        DependsOn: 'method-dependency',
        Properties: {
          RestApiId: { Ref: 'RestApiApigEvent' },
          StageName: 'dev',
        },
      },
    },
  };

  beforeEach(() => {
    serverless = new Serverless();
    serverless.service.resources = { Resources: {} };
    const options = {
      stage: 'dev',
      region: 'us-east-1',
    };
    awsCompileApigEvents = new AwsCompileApigEvents(serverless, options);
    awsCompileApigEvents.methodDep = 'method-dependency';
  });

  it('should create a deployment resource', () => awsCompileApigEvents
    .compileDeployment().then(() => {
      const deploymentLogicalId = Object
        .keys(awsCompileApigEvents.serverless.service.resources.Resources)[0];
      expect(
        awsCompileApigEvents.serverless.service.resources.Resources[deploymentLogicalId]
      ).to.deep.equal(
        serviceResourcesAwsResourcesObjectMock.Resources.DeploymentApigEvent
      );
    })
  );
});
