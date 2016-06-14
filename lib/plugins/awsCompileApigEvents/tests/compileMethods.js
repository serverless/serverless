'use strict';

const expect = require('chai').expect;
const AwsCompileApigEvents = require('../awsCompileApigEvents');
const Serverless = require('../../../Serverless');

describe('#compileMethods()', () => {
  let serverless;
  let awsCompileApigEvents;

  const serviceResourcesAwsResourcesObjectMock = {
    Resources: {
      firstMethod0ApigEvent: {
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
          ResourceId: { Ref: 'firstResource0ApigEvent' },
          RestApiId: { Ref: 'RestApiApigEvent' },
        },
      },
      firstMethod1ApigEvent: {
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
          ResourceId: { Ref: 'firstResource1ApigEvent' },
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
      'users/create': 'firstResource0ApigEvent',
      'users/create/list': 'firstResource1ApigEvent',
    };
  });

  it('should create method resources', () => {
    awsCompileApigEvents.compileMethods().then(() => {
      expect(JSON.stringify(serviceResourcesAwsResourcesObjectMock.Resources))
        .to.equal(JSON.stringify(awsCompileApigEvents.serverless.service.resources.aws.Resources));
    });
  });
});
