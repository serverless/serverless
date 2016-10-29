'use strict';

const expect = require('chai').expect;

const AwsCompileApigEvents = require('../index');
const AwsProvider = require('../../../../../provider/awsProvider');
const Serverless = require('../../../../../../../Serverless');


describe('#compileRestApi()', () => {
  let serverless;
  let awsCompileApigEvents;

  let serviceResourcesAwsResourcesObjectMock;

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
    serviceResourcesAwsResourcesObjectMock = {
      Resources: {
        [awsCompileApigEvents.provider.naming.getLogicalApiGatewayName()]: {
          Type: 'AWS::ApiGateway::RestApi',
          Properties: {
            Name: awsCompileApigEvents.provider.naming.getApiGatewayName(),
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
