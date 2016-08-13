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
        DependsOn: ['method-dependency1', 'method-dependency2'],
        Properties: {
          RestApiId: { Ref: 'RestApiApigEvent' },
          StageName: 'dev',
        },
      },
    },
    Outputs: {
      ServiceEndpoint: {
        Description: 'URL of the service endpoint',
        Value: {
          'Fn::Join': [
            '',
            [
              'https://',
              { Ref: 'RestApiApigEvent' },
              '.execute-api.us-east-1.amazonaws.com/dev',
            ],
          ],
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
    awsCompileApigEvents.methodDependencies = ['method-dependency1', 'method-dependency2'];
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

  it('should add service endpoint output', () => awsCompileApigEvents
    .compileDeployment().then(() => {
      expect(
        awsCompileApigEvents.serverless.service.resources.Outputs.ServiceEndpoint
      ).to.deep.equal(
        serviceResourcesAwsResourcesObjectMock.Outputs.ServiceEndpoint
      );
    })
  );
});
