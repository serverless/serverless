'use strict';

const expect = require('chai').expect;
const AwsCompileApigEvents = require('../index');
const Serverless = require('../../../../../../../Serverless');

describe('#compileAuthorizers()', () => {
  let serverless;
  let awsCompileApigEvents;

  beforeEach(() => {
    serverless = new Serverless();
    serverless.service.service = 'first-service';
    serverless.service.provider.compiledCloudFormationTemplate = { Resources: {} };
    serverless.service.environment = {
      stages: {
        dev: {
          regions: {
            'us-east-1': {
              vars: {
                IamRoleLambdaExecution:
                  'arn:aws:iam::12345678:role/service-dev-IamRoleLambdaExecution-FOO12345678',
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
    awsCompileApigEvents.restApiLogicalId = 'ApiGatewayRestApi';
    awsCompileApigEvents.serverless.service.functions = {
      first: {
        events: [
          {
            http: {
              path: 'users/create',
              method: 'POST',
              authorizer: 'authorizer',
            },
          },
        ],
      },
      authorizer: {
        events: [
          {
            http: {
              path: 'users/list',
              method: 'get',
            },
          },
        ],
      },
    };
  });

  it('should create default authorizer resource if string is provided', () => awsCompileApigEvents
    .compileAuthorizers({
      events: [
        {
          path: 'users/create',
          method: 'POST',
          authorizer: {
            name: 'authorizer',
          },
        },
      ],
    }).then(() => {
      expect(
        awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.AuthorizerApiGatewayAuthorizer.Type
      ).to.equal('AWS::ApiGateway::Authorizer');

      expect(
        awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.AuthorizerApiGatewayAuthorizer.Properties.AuthorizerResultTtlInSeconds
      ).to.equal(300);

      expect(
        awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.AuthorizerApiGatewayAuthorizer.Properties.IdentitySource
      ).to.equal('method.request.header.Authorization');

      expect(
        awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.AuthorizerApiGatewayAuthorizer.Properties.Name
      ).to.equal('authorizer');

      expect(
        awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.AuthorizerApiGatewayAuthorizer.Properties.RestApiId.Ref
      ).to.equal('ApiGatewayRestApi');

      expect(
        awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.AuthorizerApiGatewayAuthorizer.Properties.Type
      ).to.equal('TOKEN');
    })
  );

  it('should create authorizer with the given config object', () => awsCompileApigEvents
    .compileAuthorizers({
      events: [
        {
          authorizer: {
            name: 'authorizer',
            resultTtlInSeconds: 400,
            identitySource: 'method.request.header.Custom',
            identityValidationExpression: 'regex',
          },
        },
      ],
    }).then(() => {
      expect(
        awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.AuthorizerApiGatewayAuthorizer.Properties.AuthorizerResultTtlInSeconds
      ).to.equal(400);

      expect(
        awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.AuthorizerApiGatewayAuthorizer.Properties.IdentitySource
      ).to.equal('method.request.header.Custom');

      expect(
        awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.AuthorizerApiGatewayAuthorizer.Properties.IdentityValidationExpression
      ).to.equal('regex');
    })
  );

  it('should create authorizer with the given config object with ARN', () => awsCompileApigEvents
    .compileAuthorizers({
      events: [
        {
          authorizer: {
            name: 'authorizer',
            arn: 'sss:dev-authorizer',
            resultTtlInSeconds: 500,
            identitySource: 'method.request.header.Custom',
            identityValidationExpression: 'regex',
          },
        },
      ],
    }).then(() => {
      expect(
        awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.AuthorizerApiGatewayAuthorizer.Properties.AuthorizerResultTtlInSeconds
      ).to.equal(500);

      expect(
        awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.AuthorizerApiGatewayAuthorizer.Properties.IdentitySource
      ).to.equal('method.request.header.Custom');

      expect(
        awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.AuthorizerApiGatewayAuthorizer.Properties.IdentityValidationExpression
      ).to.equal('regex');

      expect(
        awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.AuthorizerApiGatewayAuthorizer.Properties.Name
      ).to.equal('authorizer');
    })
  );
});
