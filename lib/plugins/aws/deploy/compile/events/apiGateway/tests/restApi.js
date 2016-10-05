'use strict';

const expect = require('chai').expect;

const AwsCompileApigEvents = require('../index');
const Serverless = require('../../../../../../../Serverless');


describe('#compileRestApi()', () => {
  let serverless;
  let awsCompileApigEvents;

  let serviceResourcesAwsResourcesObjectMock;

  beforeEach(() => {
    serverless = new Serverless();
    serverless.service.provider.compiledCloudFormationTemplate = { Resources: {} };
    const options = {
      stage: 'dev',
      region: 'us-east-1',
    };
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
    serviceResourcesAwsResourcesObjectMock = {
      Resources: {
        [awsCompileApigEvents.sdk.naming.getLogicalApiGatewayName()]: {
          Type: 'AWS::ApiGateway::RestApi',
          Properties: {
            Name: awsCompileApigEvents.sdk.naming.getApiGatewayName(),
          },
        },
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
});
