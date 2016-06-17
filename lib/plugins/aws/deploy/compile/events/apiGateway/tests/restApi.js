'use strict';

const expect = require('chai').expect;
const AwsCompileApigEvents = require('../index');
const Serverless = require('../../../../../../../Serverless');

describe('#compileRestApi()', () => {
  let serverless;
  let awsCompileApigEvents;

  const serviceResourcesAwsResourcesObjectMock = {
    Resources: {
      RestApiApigEvent: {
        Type: 'AWS::ApiGateway::RestApi',
        Properties: {
          Name: 'dev-new-service',
        },
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
            http_endpoints: {
              post: 'foo/bar',
            },
          },
        },
      },
    };
  });

  it('should create a REST API resource', () => awsCompileApigEvents
    .compileRestApi().then(() => {
      expect(
        awsCompileApigEvents.serverless.service.resources.aws.Resources
      ).to.deep.equal(
        serviceResourcesAwsResourcesObjectMock.Resources
      );
    })
  );
});
