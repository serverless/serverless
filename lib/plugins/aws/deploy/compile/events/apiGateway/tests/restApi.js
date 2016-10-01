'use strict';

const expect = require('chai').expect;
const AwsCompileApigEvents = require('../index');
const pathLib = require('path');
const Serverless = require('../../../../../../../Serverless');

const naming = require(pathLib.join(__dirname, '..', '..', '..', '..', '..', 'lib', 'naming.js'));

describe('#compileRestApi()', () => {
  let serverless;
  let awsCompileApigEvents;

  const logicalApiGatewayName = naming.getLogicalApiGatewayName();
  const serviceResourcesAwsResourcesObjectMock = {
    Resources: {
      [logicalApiGatewayName]: {
        Type: 'AWS::ApiGateway::RestApi',
        Properties: {
          Name: '[placeholder]',
        },
      },
    },
  };

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
    serviceResourcesAwsResourcesObjectMock.Resources[logicalApiGatewayName].Properties
      .Name = naming.getApiGatewayName();
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
