'use strict';

const expect = require('chai').expect;
const AwsCompileApigEvents = require('../index');
const Serverless = require('../../../../../../../Serverless');

describe('#compileMethods()', () => {
  let serverless;
  let awsCompileApigEvents;

  beforeEach(() => {
    serverless = new Serverless();
    serverless.init();
    serverless.service.service = 'first-service';
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

  it('should create method resources', () => awsCompileApigEvents
    .compileMethods().then(() => {
      expect(
        awsCompileApigEvents.serverless.service.resources.aws.Resources.PostMethodApigEvent0.Type
      ).to.equal('AWS::ApiGateway::Method');
      expect(
        awsCompileApigEvents.serverless.service.resources.aws.Resources.GetMethodApigEvent1.Type
      ).to.equal('AWS::ApiGateway::Method');
    })
  );
});
