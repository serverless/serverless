'use strict';

const expect = require('chai').expect;
const AwsCompileApigEvents = require('../index');
const Serverless = require('../../../../../../../Serverless');

describe('#compileCors()', () => {
  let serverless;
  let awsCompileApigEvents;

  beforeEach(() => {
    serverless = new Serverless();
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
    const options = {
      stage: 'dev',
      region: 'us-east-1',
    };
    awsCompileApigEvents = new AwsCompileApigEvents(serverless, options);
    awsCompileApigEvents.restApiLogicalId = 'ApiGatewayRestApi';
    awsCompileApigEvents.resourceLogicalIds = {
      'users/create': 'ApiGatewayResourceUsersCreate',
      'users/list': 'ApiGatewayResourceUsersList',
      'users/update': 'ApiGatewayResourceUsersUpdate',
      'users/delete': 'ApiGatewayResourceUsersDelete',
    };
    awsCompileApigEvents.resourceNames = {
      'users/create': 'UsersCreate',
      'users/list': 'UsersList',
      'users/update': 'UsersUpdate',
      'users/delete': 'UsersDelete',
    };
  });

  it('should create preflight method for CORS enabled resource', () =>
    awsCompileApigEvents.compileCors({
      events: [],
      corsPreflight: {
        'users/update': {
          origins: ['*'],
          headers: ['*'],
          methods: ['OPTIONS', 'PUT'],
        },
        'users/create': {
          origins: ['*'],
          headers: ['*'],
          methods: ['OPTIONS', 'POST'],
        },
        'users/delete': {
          origins: ['*'],
          headers: ['CustomHeaderA', 'CustomHeaderB'],
          methods: ['OPTIONS', 'DELETE'],
        },
      },
    }).then(() => {
      expect(
        awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.ApiGatewayMethodUsersCreateOptions
          .Properties.Integration.IntegrationResponses[0]
          .ResponseParameters['method.response.header.Access-Control-Allow-Origin']
      ).to.equal('*');

      expect(
        awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.ApiGatewayMethodUsersCreateOptions
          .Properties.Integration.IntegrationResponses[0]
          .ResponseParameters['method.response.header.Access-Control-Allow-Headers']
      ).to.equal('*');

      expect(
        awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.ApiGatewayMethodUsersCreateOptions
          .Properties.Integration.IntegrationResponses[0]
          .ResponseParameters['method.response.header.Access-Control-Allow-Methods']
      ).to.equal('OPTIONS,POST');

      expect(
        awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.ApiGatewayMethodUsersUpdateOptions
          .Properties.Integration.IntegrationResponses[0]
          .ResponseParameters['method.response.header.Access-Control-Allow-Origin']
      ).to.equal('*');

      expect(
        awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.ApiGatewayMethodUsersUpdateOptions
          .Properties.Integration.IntegrationResponses[0]
          .ResponseParameters['method.response.header.Access-Control-Allow-Methods']
      ).to.equal('OPTIONS,PUT');

      expect(
        awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.ApiGatewayMethodUsersDeleteOptions
          .Properties.Integration.IntegrationResponses[0]
          .ResponseParameters['method.response.header.Access-Control-Allow-Origin']
      ).to.equal('*');

      expect(
        awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.ApiGatewayMethodUsersDeleteOptions
          .Properties.Integration.IntegrationResponses[0]
          .ResponseParameters['method.response.header.Access-Control-Allow-Headers']
      ).to.equal('CustomHeaderA,CustomHeaderB');

      expect(
        awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.ApiGatewayMethodUsersDeleteOptions
          .Properties.Integration.IntegrationResponses[0]
          .ResponseParameters['method.response.header.Access-Control-Allow-Methods']
      ).to.equal('OPTIONS,DELETE');
    })
  );
});
