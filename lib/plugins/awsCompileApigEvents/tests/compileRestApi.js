'use strict';

const expect = require('chai').expect;
const AwsCompileApigEvents = require('../awsCompileApigEvents');
const Serverless = require('../../../Serverless');

describe('#compileRestApi()', () => {
  let serverless;
  let awsCompileApigEvents;

  const serviceResourcesAwsResourcesObjectMock = {
    Resources: {
      Type: 'AWS::ApiGateway::RestApi',
      Properties: {
        Name: 'dev-new-service',
      },
    },
  };

  beforeEach(() => {
    serverless = new Serverless();
    serverless.init();
    serverless.service.resources = { aws: { Resources: {} } };
    const options = {
      stage: 'dev',
      region: 'us-east-1',
    };
    awsCompileApigEvents = new AwsCompileApigEvents(serverless, options);
    awsCompileApigEvents.serverless.service.service = 'new-service';
    awsCompileApigEvents.serverless.service.functions = {
      hello: {
        events: {
          aws: {
            http_endpoint: {
              post: 'foo/bar',
            },
          },
        },
      },
    };
  });

  it('should create REST API resource', () => {
    awsCompileApigEvents.compileRestApi().then(() => {
      expect(JSON.strigify(awsCompileApigEvents.serverless.service.resources.aws.Resources))
        .to.equal(JSON.stringify(serviceResourcesAwsResourcesObjectMock.Resources));
    });
  });
});
