'use strict';

const expect = require('chai').expect;
const AwsCompileApigEvents = require('../index');
const Serverless = require('../../../../../../../Serverless');
const AwsProvider = require('../../../../../provider/awsProvider');

describe('#compileDeployment()', () => {
  let serverless;
  let provider;
  let awsCompileApigEvents;

  beforeEach(() => {
    const options = {
      stage: 'dev',
      region: 'us-east-1',
    };
    serverless = new Serverless();
    provider = new AwsProvider(serverless, options);
    serverless.setProvider('aws', provider);
    serverless.service.provider.compiledCloudFormationTemplate = {
      Resources: {},
      Outputs: {},
    };
    awsCompileApigEvents = new AwsCompileApigEvents(serverless, options);
    awsCompileApigEvents.apiGatewayRestApiLogicalId = 'ApiGatewayRestApi';
    awsCompileApigEvents.apiGatewayMethodLogicalIds = ['method-dependency1', 'method-dependency2'];
    awsCompileApigEvents.provider = provider;
  });

  it('should create a deployment resource', () => awsCompileApigEvents
    .compileDeployment().then(() => {
      const apiGatewayDeploymentLogicalId = Object
        .keys(awsCompileApigEvents.serverless.service.provider
          .compiledCloudFormationTemplate.Resources)[0];

      expect(
        awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources[apiGatewayDeploymentLogicalId]
      ).to.deep.equal({
        Type: 'AWS::ApiGateway::Deployment',
        DependsOn: ['method-dependency1', 'method-dependency2'],
        Properties: {
          RestApiId: {
            Ref: awsCompileApigEvents.apiGatewayRestApiLogicalId,
          },
          StageName: 'dev',
        },
      });
    })
  );

  it('should add service endpoint output', () =>
    awsCompileApigEvents.compileDeployment().then(() => {
      expect(
        awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Outputs.ServiceEndpoint
      ).to.deep.equal({
        Description: 'URL of the service endpoint',
        Value: {
          'Fn::Join': [
            '',
            [
              'https://',
              { Ref: awsCompileApigEvents.apiGatewayRestApiLogicalId },
              '.execute-api.us-east-1.',
              { Ref: 'AWS::URLSuffix' },
              '/dev',
            ],
          ],
        },
      });
    })
  );
});
