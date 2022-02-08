'use strict';

const expect = require('chai').expect;
const runServerless = require('../../../../../utils/run-serverless');

describe('test/unit/lib/plugins/aws/info/display.test.js', () => {
  let serverless;
  let serviceName;

  before(async () => {
    ({
      serverless,
      fixtureData: {
        serviceConfig: { service: serviceName },
      },
    } = await runServerless({
      fixture: 'api-gateway',
      command: 'info',
      awsRequestStubMap: {
        APIGateway: {
          getApiKey: {
            value: 'test-key-value',
            name: 'test-key-name',
          },
        },
        CloudFormation: {
          describeStacks: {
            Stacks: [
              {
                Outputs: [
                  {
                    OutputKey: 'ServiceEndpoint',
                    OutputValue: 'https://xxxxx.execute-api.us-east-1.amazonaws.com/dev',
                    Description: 'URL of the service endpoint',
                    ExportName: 'sls-test-api-gw',
                  },
                  {
                    OutputKey: 'ServerlessDeploymentBucketName',
                    OutputValue: 'test-api-gw-dev-serverlessdeploymentbucket-xxxxx',
                    ExportName: 'sls-test-api-gw-ServerlessDeploymentBucketName',
                  },
                  {
                    OutputKey: 'LayerLambdaLayerQualifiedArn',
                    OutputValue: 'arn:aws:lambda:us-east-1:00000000:layer:layer:1',
                  },
                  {
                    OutputKey: 'WithUrlLambdaFunctionUrl',
                    OutputValue: 'https://sub.lambda.com',
                  },
                ],
              },
            ],
          },
          describeStackResources: {
            StackResources: [
              {
                PhysicalResourceId: 'test',
                ResourceType: 'AWS::ApiGateway::ApiKey',
              },
            ],
          },
          listStackResources: {},
        },
      },
      configExt: {
        provider: {
          apiGateway: {
            apiKeys: [
              { name: 'full-key', value: 'full-key-asdf-asdf-asdf-adfafdadfadfadfadfafafdafadf' },
              'no-value-key',
              { value: 'no-name-key-asdf-asdf-asdf-adfafdadfadfadfadfafafdafadf' },
            ],
          },
        },
        functions: {
          withUrl: {
            handler: 'index.handler',
            url: true,
          },
        },
        layers: {
          layer: {
            path: 'layer',
          },
        },
      },
    }));
  });

  it('should register api gateway api keys section', () => {
    expect(serverless.serviceOutputs.get('api keys')).to.deep.equal([
      'test-key-name: test-key-value',
    ]);
  });

  it('should register endpoints section', () => {
    expect(serverless.serviceOutputs.get('endpoints')).to.deep.equal([
      'GET - https://xxxxx.execute-api.us-east-1.amazonaws.com/dev',
      'POST - https://xxxxx.execute-api.us-east-1.amazonaws.com/dev/minimal-1',
      'GET - https://xxxxx.execute-api.us-east-1.amazonaws.com/dev/foo',
      'POST - https://xxxxx.execute-api.us-east-1.amazonaws.com/dev/some-post',
      'GET - https://xxxxx.execute-api.us-east-1.amazonaws.com/dev/bar/{marko}',
      'withUrl: https://sub.lambda.com',
    ]);
  });
  it('should register functions section', () => {
    expect(serverless.serviceOutputs.get('functions')).to.deep.equal([
      `minimal: ${serviceName}-dev-minimal`,
      `foo: ${serviceName}-dev-foo`,
      `other: ${serviceName}-dev-other`,
      `withUrl: ${serviceName}-dev-withUrl`,
    ]);
  });
  it('should register layers section', () => {
    expect(serverless.serviceOutputs.get('layers')).to.deep.equal([
      'layer: arn:aws:lambda:us-east-1:00000000:layer:layer:1',
    ]);
  });
});
