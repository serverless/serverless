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
        },
      },
    },
  };

  beforeEach(() => {
    serverless = new Serverless();
    serverless.setProvider('aws', new AwsProvider(serverless));
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
