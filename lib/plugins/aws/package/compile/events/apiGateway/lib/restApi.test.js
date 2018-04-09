'use strict';

const expect = require('chai').expect;
const AwsCompileApigEvents = require('../index');
const Serverless = require('../../../../../../../Serverless');
const AwsProvider = require('../../../../../provider/awsProvider');

describe('#compileRestApi()', () => {
  let serverless;
  let awsCompileApigEvents;

  const serviceResourcesAwsResourcesObjectMock = {
    Resources: {
      ApiGatewayRestApi: {
        Type: 'AWS::ApiGateway::RestApi',
        Properties: {
          Name: 'dev-new-service',
          EndpointConfiguration: {
            Types: [
              'EDGE',
            ],
          },
        },
      },
    },
  };

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

  it('should create a REST API resource', () => awsCompileApigEvents
    .compileRestApi().then(() => {
      expect(
        awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources
      ).to.deep.equal(
        serviceResourcesAwsResourcesObjectMock.Resources
      );
    })
  );

  it('should ignore REST API resource creation if there is predefined restApi config',
    () => {
      awsCompileApigEvents.serverless.service.provider.apiGateway = {
        restApiId: '6fyzt1pfpk',
        restApiRootResourceId: 'z5d4qh4oqi',
      };
      return awsCompileApigEvents
      .compileRestApi().then(() => {
        expect(
          awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate
            .Resources
        ).to.deep.equal({});
      });
    }
  );

  it('throw error if endpointType property is not a string', () => {
    awsCompileApigEvents.serverless.service.provider.endpointType = ['EDGE'];
    expect(() => awsCompileApigEvents.compileRestApi()).to.throw(Error);
  });

  it('throw error if endpointType property is not EDGE or REGIONAL', () => {
    awsCompileApigEvents.serverless.service.provider.endpointType = 'Testing';
    expect(() => awsCompileApigEvents.compileRestApi()).to.throw('endpointType must be one of');
  });
});
