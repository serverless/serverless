'use strict';

const expect = require('chai').expect;
const AwsCompileApigEvents = require('../awsCompileApigEvents');
const Serverless = require('../../../Serverless');

describe('#compileMethods()', () => {
  let serverless;
  let awsCompileApigEvents;

  const serviceResourcesAwsResourcesObjectMock = {
    Resources: {
      PostMethodApigEvent0: {
        Type: 'AWS::ApiGateway::Method',
        Properties: {
          AuthorizationType: 'NONE',
          HttpMethod: 'POST',
          MethodResponses: [
            {
              ResponseModels: {},
              ResponseParameters: {},
              StatusCode: '200',
            },
          ],
          RequestParameters: {},
          Integration: {
            IntegrationHttpMethod: 'POST',
            Type: 'AWS',
            Uri: 'arn:aws:apigateway:aws_useast1:' +
            'lambda:path/2015-03-31/functions/' +
            'arn:aws:lambda:aws_useast1:12345678:first/invocations',
          },
          ResourceId: { Ref: 'ResourceApigEvent1' },
          RestApiId: { Ref: 'RestApiApigEvent' },
        },
      },
      GetMethodApigEvent1: {
        Type: 'AWS::ApiGateway::Method',
        Properties: {
          AuthorizationType: 'NONE',
          HttpMethod: 'GET',
          MethodResponses: [
            {
              ResponseModels: {},
              ResponseParameters: {},
              StatusCode: '200',
            },
          ],
          RequestParameters: {},
          Integration: {
            IntegrationHttpMethod: 'GET',
            Type: 'AWS',
            Uri: 'arn:aws:apigateway:aws_useast1:' +
            'lambda:path/2015-03-31/functions/' +
            'arn:aws:lambda:aws_useast1:12345678:first/invocations',
          },
          ResourceId: { Ref: 'ResourceApigEvent1' },
          RestApiId: { Ref: 'RestApiApigEvent' },
        },
      },
    },
  };

  beforeEach(() => {
    serverless = new Serverless();
    serverless.init();
    serverless.service.functions = {
      first: {
        events: {
          aws: {
            http_endpoints: {
              post: 'users/create',
              get: 'users/create/list',
            },
          },
        },
      },
    };
    serverless.service.resources = {
      aws: {
        Resources: {},
      },
    };
    serverless.service.environment = {
      stages: {
        dev: {
          regions: {
            aws_useast1: {
              vars: {
                iamRoleArnLambda:
                  'arn:aws:iam::12345678:role/service-dev-IamRoleLambda-FOO12345678',
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
    awsCompileApigEvents.resourceLogicalIds = {
      'users/create': 'ResourceApigEvent0',
      'users/create/list': 'ResourceApigEvent1',
    };
  });

  it('should create method resources', () => {
    awsCompileApigEvents.compileMethods().then(() => {
      expect(JSON.stringify(serviceResourcesAwsResourcesObjectMock.Resources))
        .to.equal(JSON.stringify(awsCompileApigEvents.serverless.service.resources.aws.Resources));
    });
  });
});
