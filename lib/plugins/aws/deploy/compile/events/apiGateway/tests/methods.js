'use strict';

const expect = require('chai').expect;
const AwsCompileApigEvents = require('../index');
const Serverless = require('../../../../../../../Serverless');

describe('#compileMethods()', () => {
  let serverless;
  let awsCompileApigEvents;

  beforeEach(() => {
    serverless = new Serverless();
    serverless.service.service = 'first-service';
    serverless.service.resources = { Resources: {} };
    serverless.service.environment = {
      stages: {
        dev: {
          regions: {
            'us-east-1': {
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
    awsCompileApigEvents.serverless.service.functions = {
      first: {
        events: [
          {
            http: {
              path: 'users/create',
              method: 'POST',
            },
          },
          {
            http: 'GET users/list',
          },
        ],
      },
    };
    awsCompileApigEvents.resourceLogicalIds = {
      'users/create': 'ResourceApigEvent0',
      'users/list': 'ResourceApigEvent1',
    };
  });

  it('should create method resources when http events given', () => awsCompileApigEvents
    .compileMethods().then(() => {
      JSON.stringify(awsCompileApigEvents.serverless.service.resources.Resources);
      expect(
        awsCompileApigEvents.serverless.service.resources.Resources.PostMethodApigEvent0.Type
      ).to.equal('AWS::ApiGateway::Method');
      expect(
        awsCompileApigEvents.serverless.service.resources.Resources.GetMethodApigEvent1.Type
      ).to.equal('AWS::ApiGateway::Method');
    })
  );

  it('should not create method resources when http events are not given', () => {
    awsCompileApigEvents.serverless.service.functions = {
      first: {
        events: [],
      },
    };

    return awsCompileApigEvents.compileMethods().then(() => {
      expect(
        awsCompileApigEvents.serverless.service.resources.Resources
      ).to.deep.equal({});
    });
  });

  it('should set the correct lambdaUri', () => {
    const lambdaUri = `arn:aws:apigateway:${
      awsCompileApigEvents.options.region}:lambda:path/2015-03-31/functions/arn:aws:lambda:${
      awsCompileApigEvents.options.region}:12345678:function:${
      awsCompileApigEvents.serverless.service.service}-${
      awsCompileApigEvents.options.stage}-first/invocations`;

    return awsCompileApigEvents.compileMethods().then(() => {
      expect(
        awsCompileApigEvents.serverless.service.resources.Resources.PostMethodApigEvent0.Properties
          .Integration.Uri
      ).to.equal(lambdaUri);
      expect(
        awsCompileApigEvents.serverless.service.resources.Resources.GetMethodApigEvent1.Properties
          .Integration.Uri
      ).to.equal(lambdaUri);
    });
  });
});
