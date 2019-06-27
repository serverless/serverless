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
        },
      });
    });
  });

  it('throw error if endpointType property is not a string', () => {
    awsCompileApigEvents.serverless.service.provider.endpointType = ['EDGE'];
    expect(() => awsCompileApigEvents.compileRestApi()).to.throw(Error);
  });

  it('should compile if endpointType property is REGIONAL', () => {
    awsCompileApigEvents.serverless.service.provider.endpointType = 'REGIONAL';
    expect(() => awsCompileApigEvents.compileRestApi()).to.not.throw(Error);
  });

  it('should compile if endpointType property is PRIVATE', () => {
    awsCompileApigEvents.serverless.service.provider.endpointType = 'PRIVATE';
    expect(() => awsCompileApigEvents.compileRestApi()).to.not.throw(Error);
  });

  it('throw error if endpointType property is not EDGE or REGIONAL', () => {
    awsCompileApigEvents.serverless.service.provider.endpointType = 'Testing';
    expect(() => awsCompileApigEvents.compileRestApi()).to.throw('endpointType must be one of');
  });

  it('should compile correctly if apiKeySourceType property is HEADER', () => {
    awsCompileApigEvents.serverless.service.provider.apiGateway = { apiKeySourceType: 'HEADER' };
    expect(() => awsCompileApigEvents.compileRestApi()).to.not.throw(Error);
  });

  it('should compile correctly if apiKeySourceType property is AUTHORIZER', () => {
    awsCompileApigEvents.serverless.service.provider.apiGateway = {
      apiKeySourceType: 'AUTHORIZER',
    };
    expect(() => awsCompileApigEvents.compileRestApi()).to.not.throw(Error);
  });

  it('throw error if apiKeySourceType is not HEADER or AUTHORIZER', () => {
    awsCompileApigEvents.serverless.service.provider.apiGateway = { apiKeySourceType: 'Testing' };
    return expect(awsCompileApigEvents.compileRestApi()).to.be.rejectedWith(Error);
  });

  it('should compile correctly if minimumCompressionSize is an integer', () => {
    awsCompileApigEvents.serverless.service.provider.apiGateway = {
      minimumCompressionSize: 1024,
    };
    expect(() => awsCompileApigEvents.compileRestApi()).to.not.throw(Error);
  });

  it('should throw error if minimumCompressionSize is not an integer', () => {
    awsCompileApigEvents.serverless.service.provider.apiGateway = {
      minimumCompressionSize: 'Testing',
    };
    return expect(awsCompileApigEvents.compileRestApi()).to.be.rejectedWith(Error);
  });

  it('should throw error if minimumCompressionSize is less than 0', () => {
    awsCompileApigEvents.serverless.service.provider.apiGateway = {
      minimumCompressionSize: -1,
    };
    return expect(awsCompileApigEvents.compileRestApi()).to.be.rejectedWith(Error);
  });

  it('should throw error if minimumCompressionSize is greater than 10485760', () => {
    awsCompileApigEvents.serverless.service.provider.apiGateway = {
      minimumCompressionSize: 10485761,
    };
    return expect(awsCompileApigEvents.compileRestApi()).to.be.rejectedWith(Error);
  });
});
