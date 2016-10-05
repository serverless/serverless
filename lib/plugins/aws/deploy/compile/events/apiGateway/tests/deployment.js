'use strict';

const expect = require('chai').expect;

const AwsCompileApigEvents = require('../index');
const Serverless = require('../../../../../../../Serverless');

describe('#compileDeployment()', () => {
  let serverless;
  let awsCompileApigEvents;
  let serviceResourcesAwsResourcesObjectMock;

  beforeEach(() => {
    const options = {
      stage: 'dev',
      region: 'us-east-1',
    };
    serverless = new Serverless(options);
    serverless.service.provider.compiledCloudFormationTemplate = {
      Resources: {},
      Outputs: {},
    };
    awsCompileApigEvents = new AwsCompileApigEvents(serverless, options);
    awsCompileApigEvents.methodDependencies = ['method-dependency1', 'method-dependency2'];
    serviceResourcesAwsResourcesObjectMock = {
      Resources: {
        DeploymentApigEvent: {
          Type: 'AWS::ApiGateway::Deployment',
          DependsOn: ['method-dependency1', 'method-dependency2'],
          Properties: {
            RestApiId: { Ref: awsCompileApigEvents.sdk.naming.getLogicalApiGatewayName() },
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
                { Ref: awsCompileApigEvents.sdk.naming.getLogicalApiGatewayName() },
                '.execute-api.us-east-1.amazonaws.com/dev',
              ],
            ],
          },
        },
      },
    };
  });

  it('should create a deployment resource', () => awsCompileApigEvents
    .compileDeployment().then(() => {
      const deploymentLogicalId = Object
        .keys(awsCompileApigEvents.serverless.service.provider
          .compiledCloudFormationTemplate.Resources)[0];

      expect(
        awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources[deploymentLogicalId]
      ).to.deep.equal(
        serviceResourcesAwsResourcesObjectMock.Resources.DeploymentApigEvent
      );
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
