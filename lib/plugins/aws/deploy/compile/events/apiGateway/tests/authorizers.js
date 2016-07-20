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

  it('should create authorizer with the given config object', () => {
    awsCompileApigEvents.serverless.service.functions.first.events[0].http.authorizer = {
      name: 'authorizer',
      ttl: '400',
      header: 'method.request.header.Custom',
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

      awsCompileApigEvents.serverless.service.functions
        .first.events[0].http.authorizer = 'authorizer';
    });
  });

  it('throw error if authorizer property is not a string or object', () => {
    awsCompileApigEvents.serverless.service.functions.first.events[0].http.authorizer = 2;
    expect(() => awsCompileApigEvents.compileAuthorizers()).to.throw(Error);
  });
});
