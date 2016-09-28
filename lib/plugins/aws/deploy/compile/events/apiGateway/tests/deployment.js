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
          Description: '//This is replaced//',
          RestApiId: { Ref: 'ApiGatewayRestApi' },
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
              { Ref: 'ApiGatewayRestApi' },
              '.execute-api.us-east-1.amazonaws.com/dev',
            ],
          ],
        },
      },
    },
  };

  beforeEach(() => {
    serverless = new Serverless();
    serverless.service.provider.compiledCloudFormationTemplate = {
      Resources: {},
      Outputs: {},
    };
    const options = {
      stage: 'dev',
      region: 'us-east-1',
    };
    awsCompileApigEvents = new AwsCompileApigEvents(serverless, options);
    awsCompileApigEvents.methodDependencies = ['method-dependency1', 'method-dependency2'];
  });

  it('should create a deployment resource', () => awsCompileApigEvents
    .compileDeployment().then(() => {
      // Replace the mock description with the actual auto generated value to allow deep equals
      serviceResourcesAwsResourcesObjectMock.Resources.DeploymentApigEvent.Properties.Description =
        awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.ApiGatewayDeployment.Properties.Description;

      expect(
        awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.ApiGatewayDeployment
      ).to.deep.equal(
        serviceResourcesAwsResourcesObjectMock.Resources.DeploymentApigEvent
      );
    })
  );

  it('should create a description that is a number', () => awsCompileApigEvents
    .compileDeployment().then(() => {
      expect(
        awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.ApiGatewayDeployment.Properties.Description
      ).to.be.above(0);
    })
  );

  it('should add service endpoint output', () => awsCompileApigEvents
    .compileDeployment().then(() => {
      expect(
        awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Outputs.ServiceEndpoint
      ).to.deep.equal(
        serviceResourcesAwsResourcesObjectMock.Outputs.ServiceEndpoint
      );
    })
  );
});
