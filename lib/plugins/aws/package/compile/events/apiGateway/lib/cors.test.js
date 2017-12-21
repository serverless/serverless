'use strict';

const expect = require('chai').expect;
const AwsCompileApigEvents = require('../index');
const Serverless = require('../../../../../../../Serverless');
const AwsProvider = require('../../../../../provider/awsProvider');

describe('#compileCors()', () => {
  let serverless;
  let awsCompileApigEvents;

  beforeEach(() => {
    const options = {
      stage: 'dev',
      region: 'us-east-1',
    };
    serverless = new Serverless();
    serverless.setProvider('aws', new AwsProvider(serverless, options));
    serverless.service.service = 'first-service';
    serverless.service.provider.compiledCloudFormationTemplate = { Resources: {} };
    serverless.service.environment = {
      stages: {
        dev: {
          regions: {
            'us-east-1': {
              vars: {
                IamRoleLambdaExecution:
                  'arn:aws:iam::12345678:role/service-dev-IamRoleLambdaExecution-FOO12345678',
              },
            },
          },
        },
      },
    };
    awsCompileApigEvents = new AwsCompileApigEvents(serverless, options);
    awsCompileApigEvents.apiGatewayRestApiLogicalId = 'ApiGatewayRestApi';
    awsCompileApigEvents.apiGatewayResourceLogicalIds = {
      'users/create': 'ApiGatewayResourceUsersCreate',
      'users/list': 'ApiGatewayResourceUsersList',
      'users/update': 'ApiGatewayResourceUsersUpdate',
      'users/delete': 'ApiGatewayResourceUsersDelete',
      'users/any': 'ApiGatewayResourceUsersAny',
    };
    awsCompileApigEvents.apiGatewayResourceNames = {
      'users/create': 'UsersCreate',
      'users/list': 'UsersList',
      'users/update': 'UsersUpdate',
      'users/delete': 'UsersDelete',
      'users/any': 'UsersAny',
    };
    awsCompileApigEvents.validated = {};
  });

  it('should create preflight method for CORS enabled resource', () => {
    awsCompileApigEvents.validated.corsPreflight = {
      'users/update': {
        origin: 'http://example.com',
        headers: ['*'],
        methods: ['OPTIONS', 'PUT'],
        allowCredentials: false,
      },
      'users/create': {
        origins: ['*', 'http://example.com'],
        headers: ['*'],
        methods: ['OPTIONS', 'POST'],
        allowCredentials: true,
      },
      'users/delete': {
        origins: ['*'],
        headers: ['CustomHeaderA', 'CustomHeaderB'],
        methods: ['OPTIONS', 'DELETE'],
        allowCredentials: false,
      },
      'users/any': {
        origins: ['http://example.com'],
        headers: ['*'],
        methods: ['OPTIONS', 'ANY'],
        allowCredentials: false,
      },
    };
    return awsCompileApigEvents.compileCors().then(() => {
      // users/create
      expect(
        awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.ApiGatewayMethodUsersCreateOptions
          .Properties.Integration.IntegrationResponses[0]
          .ResponseParameters['method.response.header.Access-Control-Allow-Origin']
      ).to.equal('\'*,http://example.com\'');

      expect(
        awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.ApiGatewayMethodUsersCreateOptions
          .Properties.Integration.IntegrationResponses[0]
          .ResponseParameters['method.response.header.Access-Control-Allow-Headers']
      ).to.equal('\'*\'');

      expect(
        awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.ApiGatewayMethodUsersCreateOptions
          .Properties.Integration.IntegrationResponses[0]
          .ResponseParameters['method.response.header.Access-Control-Allow-Methods']
      ).to.equal('\'OPTIONS,POST\'');

      expect(
        awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.ApiGatewayMethodUsersCreateOptions
          .Properties.Integration.IntegrationResponses[0]
          .ResponseParameters['method.response.header.Access-Control-Allow-Credentials']
      ).to.equal('\'true\'');

      // users/update
      expect(
        awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.ApiGatewayMethodUsersUpdateOptions
          .Properties.Integration.IntegrationResponses[0]
          .ResponseParameters['method.response.header.Access-Control-Allow-Origin']
      ).to.equal('\'http://example.com\'');

      expect(
        awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.ApiGatewayMethodUsersUpdateOptions
          .Properties.Integration.IntegrationResponses[0]
          .ResponseParameters['method.response.header.Access-Control-Allow-Methods']
      ).to.equal('\'OPTIONS,PUT\'');

      expect(
        awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.ApiGatewayMethodUsersUpdateOptions
          .Properties.Integration.IntegrationResponses[0]
          .ResponseParameters['method.response.header.Access-Control-Allow-Credentials']
      ).to.equal('\'false\'');

      // users/delete
      expect(
        awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.ApiGatewayMethodUsersDeleteOptions
          .Properties.Integration.IntegrationResponses[0]
          .ResponseParameters['method.response.header.Access-Control-Allow-Origin']
      ).to.equal('\'*\'');

      expect(
        awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.ApiGatewayMethodUsersDeleteOptions
          .Properties.Integration.IntegrationResponses[0]
          .ResponseParameters['method.response.header.Access-Control-Allow-Headers']
      ).to.equal('\'CustomHeaderA,CustomHeaderB\'');

      expect(
        awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.ApiGatewayMethodUsersDeleteOptions
          .Properties.Integration.IntegrationResponses[0]
          .ResponseParameters['method.response.header.Access-Control-Allow-Methods']
      ).to.equal('\'OPTIONS,DELETE\'');

      expect(
        awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.ApiGatewayMethodUsersDeleteOptions
          .Properties.Integration.IntegrationResponses[0]
          .ResponseParameters['method.response.header.Access-Control-Allow-Credentials']
      ).to.equal('\'false\'');

      // users/any
      expect(
        awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.ApiGatewayMethodUsersAnyOptions
          .Properties.Integration.IntegrationResponses[0]
          .ResponseParameters['method.response.header.Access-Control-Allow-Origin']
      ).to.equal('\'http://example.com\'');

      expect(
        awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.ApiGatewayMethodUsersAnyOptions
          .Properties.Integration.IntegrationResponses[0]
          .ResponseParameters['method.response.header.Access-Control-Allow-Headers']
      ).to.equal('\'*\'');

      expect(
        awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.ApiGatewayMethodUsersAnyOptions
          .Properties.Integration.IntegrationResponses[0]
          .ResponseParameters['method.response.header.Access-Control-Allow-Methods']
      ).to.equal('\'OPTIONS,DELETE,GET,HEAD,PATCH,POST,PUT\'');

      expect(
        awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.ApiGatewayMethodUsersAnyOptions
          .Properties.Integration.IntegrationResponses[0]
          .ResponseParameters['method.response.header.Access-Control-Allow-Credentials']
      ).to.equal('\'false\'');
    });
  });
});
