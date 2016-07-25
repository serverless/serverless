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
    .compileAuthorizers().then(() => {
      expect(
        awsCompileApigEvents.serverless.service.resources.Resources.authorizerAuthorizer.Type
      ).to.equal('AWS::ApiGateway::Authorizer');

      expect(
        awsCompileApigEvents.serverless.service.resources.Resources.authorizerAuthorizer.Properties
          .AuthorizerResultTtlInSeconds
      ).to.equal('300');

      expect(
        awsCompileApigEvents.serverless.service.resources.Resources.authorizerAuthorizer.Properties
          .IdentitySource
      ).to.equal('method.request.header.Auth');

      expect(
        awsCompileApigEvents.serverless.service.resources.Resources.authorizerAuthorizer.Properties
          .Name
      ).to.equal('authorizer');

      expect(
        awsCompileApigEvents.serverless.service.resources.Resources.authorizerAuthorizer.Properties
          .RestApiId.Ref
      ).to.equal('RestApiApigEvent');

      expect(
        awsCompileApigEvents.serverless.service.resources.Resources.authorizerAuthorizer.Properties
          .Type
      ).to.equal('TOKEN');
    })
  );

  it('should create default authorizer resource if string ARN is provided', () => {
    awsCompileApigEvents.serverless.service.functions
      .first.events[0].http.authorizer = 'sss:dev-authorizer';

    return awsCompileApigEvents.compileAuthorizers().then(() => {
      expect(
        awsCompileApigEvents.serverless.service.resources.Resources.authorizerAuthorizer.Properties
          .Name
      ).to.equal('authorizer');

      awsCompileApigEvents.serverless.service.functions
        .first.events[0].http.authorizer = 'authorizer';
    });
  });

  it('should create authorizer with the given config object', () => {
    awsCompileApigEvents.serverless.service.functions.first.events[0].http.authorizer = {
      name: 'authorizer',
      resultTtlInSeconds: '400',
      identitySource: 'method.request.header.Custom',
      identityValidationExpression: 'regex',
    };

    return awsCompileApigEvents.compileAuthorizers().then(() => {
      expect(
        awsCompileApigEvents.serverless.service.resources.Resources.authorizerAuthorizer.Properties
          .AuthorizerResultTtlInSeconds
      ).to.equal('400');

      expect(
        awsCompileApigEvents.serverless.service.resources.Resources.authorizerAuthorizer.Properties
          .IdentitySource
      ).to.equal('method.request.header.Custom');

      expect(
        awsCompileApigEvents.serverless.service.resources.Resources.authorizerAuthorizer.Properties
          .IdentityValidationExpression
      ).to.equal('regex');

      awsCompileApigEvents.serverless.service.functions
        .first.events[0].http.authorizer = 'authorizer';
    });
  });

  it('should create authorizer with the given config object with ARN', () => {
    awsCompileApigEvents.serverless.service.functions.first.events[0].http.authorizer = {
      arn: 'sss:dev-authorizer',
      resultTtlInSeconds: '400',
      identitySource: 'method.request.header.Custom',
      identityValidationExpression: 'regex',
    };

    return awsCompileApigEvents.compileAuthorizers().then(() => {
      expect(
        awsCompileApigEvents.serverless.service.resources.Resources.authorizerAuthorizer.Properties
          .AuthorizerResultTtlInSeconds
      ).to.equal('400');

      expect(
        awsCompileApigEvents.serverless.service.resources.Resources.authorizerAuthorizer.Properties
          .IdentitySource
      ).to.equal('method.request.header.Custom');

      expect(
        awsCompileApigEvents.serverless.service.resources.Resources.authorizerAuthorizer.Properties
          .IdentityValidationExpression
      ).to.equal('regex');

      expect(
        awsCompileApigEvents.serverless.service.resources.Resources.authorizerAuthorizer.Properties
          .Name
      ).to.equal('authorizer');

      awsCompileApigEvents.serverless.service.functions
        .first.events[0].http.authorizer = 'authorizer';
    });
  });

  it('throw error if authorizer property is not a string or object', () => {
    awsCompileApigEvents.serverless.service.functions.first.events[0].http.authorizer = 2;
    expect(() => awsCompileApigEvents.compileAuthorizers()).to.throw(Error);
  });

  it('throw error if authorizer property is an object but no name or arn provided', () => {
    awsCompileApigEvents.serverless.service.functions.first.events[0].http.authorizer = {};
    expect(() => awsCompileApigEvents.compileAuthorizers()).to.throw(Error);
  });
});
