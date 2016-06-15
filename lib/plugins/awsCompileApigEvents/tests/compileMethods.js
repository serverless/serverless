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
          ResourceId: { Ref: 'ResourceApigEvent1' },
          RestApiId: { Ref: 'RestApiApigEvent' },
        },
      },
    },
  };

  beforeEach(() => {
    serverless = new Serverless();
    serverless.init();
    serverless.service = {
      functions: {
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
      },
      resources: {
        aws: {
          Resources: {},
        },
      },
    };
    awsCompileApigEvents = new AwsCompileApigEvents(serverless);
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
