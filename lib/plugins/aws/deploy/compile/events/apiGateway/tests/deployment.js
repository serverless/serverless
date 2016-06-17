'use strict';

const expect = require('chai').expect;
const AwsCompileApigEvents = require('../index');
const Serverless = require('../../../../../../../Serverless');

describe('#compileDeployment()', () => {
  let serverless;
  let awsCompileApigEvents;

  const serviceResourcesAwsResourcesObjectMock = {
    Resources: {
      DeploymentApigEvent: {
        Type: 'AWS::ApiGateway::Deployment',
        DependsOn: 'method-dependency',
        Properties: {
          RestApiId: { Ref: 'RestApiApigEvent' },
          StageName: 'dev',
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
    awsCompileApigEvents.methodDep = 'method-dependency';
  });

  it('should create a deployment resource', () => awsCompileApigEvents
    .compileDeployment().then(() => {
      expect(
        awsCompileApigEvents.serverless.service.resources.aws.Resources
      ).to.deep.equal(
        serviceResourcesAwsResourcesObjectMock.Resources
      );
    })
  );
});
