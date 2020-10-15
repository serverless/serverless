'use strict';

const chai = require('chai');
const AwsCompileApigEvents = require('../index');
const Serverless = require('../../../../../../../Serverless');
const AwsProvider = require('../../../../../provider/awsProvider');

const expect = chai.expect;
chai.use(require('chai-as-promised'));

describe('#compileRestApi()', () => {
  let serverless;
  let awsCompileApigEvents;

  beforeEach(() => {
    const options = {
      stage: 'dev',
      region: 'us-east-1',
    };
    serverless = new Serverless();
    serverless.setProvider('aws', new AwsProvider(serverless, options));
    serverless.service.provider.compiledCloudFormationTemplate = { Resources: {} };
    awsCompileApigEvents = new AwsCompileApigEvents(serverless, options);
    awsCompileApigEvents.serverless.service.service = 'new-service';
    awsCompileApigEvents.serverless.service.functions = {
      first: {
        events: [
          {
            http: {
              path: 'foo/bar',
              method: 'POST',
            },
          },
        ],
      },
    };
  });

  it('should create a REST API resource', () =>
    awsCompileApigEvents.compileRestApi().then(() => {
      const resources =
        awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate.Resources;

      expect(resources.ApiGatewayRestApi).to.deep.equal({
        Type: 'AWS::ApiGateway::RestApi',
        Properties: {
          BinaryMediaTypes: undefined,
          Name: 'dev-new-service',
          EndpointConfiguration: {
            Types: ['EDGE'],
          },
          Policy: '',
        },
      });
    }));

  it('should create a REST API resource with resource policy', () => {
    awsCompileApigEvents.serverless.service.provider.resourcePolicy = [
      {
        Effect: 'Allow',
        Principal: '*',
        Action: 'execute-api:Invoke',
        Resource: ['execute-api:/*/*/*'],
        Condition: {
          IpAddress: {
            'aws:SourceIp': ['123.123.123.123'],
          },
        },
      },
    ];
    return awsCompileApigEvents.compileRestApi().then(() => {
      const resources =
        awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate.Resources;

      expect(resources.ApiGatewayRestApi).to.deep.equal({
        Type: 'AWS::ApiGateway::RestApi',
        Properties: {
          Name: 'dev-new-service',
          BinaryMediaTypes: undefined,
          EndpointConfiguration: {
            Types: ['EDGE'],
          },
          Policy: {
            Version: '2012-10-17',
            Statement: [
              {
                Effect: 'Allow',
                Principal: '*',
                Action: 'execute-api:Invoke',
                Resource: ['execute-api:/*/*/*'],
                Condition: {
                  IpAddress: {
                    'aws:SourceIp': ['123.123.123.123'],
                  },
                },
              },
            ],
          },
        },
      });
    });
  });

  it('should provide open policy if no policy specified', () => {
    const resources =
      awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate.Resources;

    return awsCompileApigEvents.compileRestApi().then(() => {
      expect(resources.ApiGatewayRestApi).to.deep.equal({
        Type: 'AWS::ApiGateway::RestApi',
        Properties: {
          Name: 'dev-new-service',
          BinaryMediaTypes: undefined,
          EndpointConfiguration: {
            Types: ['EDGE'],
          },
          Policy: '',
        },
      });
    });
  });

  it('should ignore REST API resource creation if there is predefined restApi config', () => {
    awsCompileApigEvents.serverless.service.provider.apiGateway = {
      restApiId: '6fyzt1pfpk',
      restApiRootResourceId: 'z5d4qh4oqi',
    };
    return awsCompileApigEvents.compileRestApi().then(() => {
      expect(
        awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate.Resources
      ).to.deep.equal({});
    });
  });

  it('should set binary media types if defined at the apiGateway provider config level', () => {
    awsCompileApigEvents.serverless.service.provider.apiGateway = {
      binaryMediaTypes: ['*/*'],
    };
    return awsCompileApigEvents.compileRestApi().then(() => {
      const resources =
        awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate.Resources;

      expect(resources.ApiGatewayRestApi).to.deep.equal({
        Type: 'AWS::ApiGateway::RestApi',
        Properties: {
          BinaryMediaTypes: ['*/*'],
          EndpointConfiguration: {
            Types: ['EDGE'],
          },
          Name: 'dev-new-service',
          Policy: '',
        },
      });
    });
  });

  it('should throw error if endpointType property is not PRIVATE and vpcEndpointIds property is [id1]', () => {
    awsCompileApigEvents.serverless.service.provider.endpointType = 'Testing';
    awsCompileApigEvents.serverless.service.provider.vpcEndpointIds = ['id1'];
    expect(() => awsCompileApigEvents.compileRestApi()).to.throw(Error);
  });
});
