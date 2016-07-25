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
      expect(
        awsCompileApigEvents.serverless.service.resources.Resources.PostMethodApigEvent0.Type
      ).to.equal('AWS::ApiGateway::Method');
      expect(
        awsCompileApigEvents.serverless.service.resources.Resources.GetMethodApigEvent1.Type
      ).to.equal('AWS::ApiGateway::Method');
    })
  );

  it('should set authorizer config if given as string', () => {
    awsCompileApigEvents.serverless.service.functions
      .first.events[0].http.authorizer = 'authorizer';

    return awsCompileApigEvents.compileMethods().then(() => {
      expect(
        awsCompileApigEvents.serverless.service.resources.Resources
          .PostMethodApigEvent0.Properties.AuthorizationType
      ).to.equal('CUSTOM');

      expect(
        awsCompileApigEvents.serverless.service.resources.Resources
          .PostMethodApigEvent0.Properties.AuthorizerId.Ref
      ).to.equal('authorizerAuthorizer');
    });
  });

  it('should set authorizer config if given as ARN string', () => {
    awsCompileApigEvents.serverless.service.functions
      .first.events[0].http.authorizer = 'xxx:dev-authorizer';

    return awsCompileApigEvents.compileMethods().then(() => {
      expect(
        awsCompileApigEvents.serverless.service.resources.Resources
          .PostMethodApigEvent0.Properties.AuthorizationType
      ).to.equal('CUSTOM');

      expect(
        awsCompileApigEvents.serverless.service.resources.Resources
          .PostMethodApigEvent0.Properties.AuthorizerId.Ref
      ).to.equal('authorizerAuthorizer');
    });
  });

  it('should set authorizer config if given as object', () => {
    awsCompileApigEvents.serverless.service.functions
      .first.events[0].http.authorizer = {
        name: 'authorizer',
      };

    return awsCompileApigEvents.compileMethods().then(() => {
      expect(
        awsCompileApigEvents.serverless.service.resources.Resources
          .PostMethodApigEvent0.Properties.AuthorizationType
      ).to.equal('CUSTOM');

      expect(
        awsCompileApigEvents.serverless.service.resources.Resources
          .PostMethodApigEvent0.Properties.AuthorizerId.Ref
      ).to.equal('authorizerAuthorizer');
    });
  });

  it('should set authorizer config if given as ARN object', () => {
    awsCompileApigEvents.serverless.service.functions
      .first.events[0].http.authorizer = {
        arn: 'xxx:dev-authorizer',
      };

    return awsCompileApigEvents.compileMethods().then(() => {
      expect(
        awsCompileApigEvents.serverless.service.resources.Resources
          .PostMethodApigEvent0.Properties.AuthorizationType
      ).to.equal('CUSTOM');

      expect(
        awsCompileApigEvents.serverless.service.resources.Resources
          .PostMethodApigEvent0.Properties.AuthorizerId.Ref
      ).to.equal('authorizerAuthorizer');
    });
  });

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

  it('should set api key as required if private endpoint', () => {
    awsCompileApigEvents.serverless.service.functions
      .first.events[0].http.private = true;

    return awsCompileApigEvents.compileMethods().then(() => {
      expect(
        awsCompileApigEvents.serverless.service.resources.Resources
          .PostMethodApigEvent0.Properties.ApiKeyRequired
      ).to.equal(true);
    });
  });

  it('should set the correct lambdaUri', () => {
    const lambdaUriObject = {
      'Fn::Join': ['', [
        'arn:aws:apigateway:',
        { Ref: 'AWS::Region' },
        ':lambda:path/2015-03-31/functions/',
        { 'Fn::GetAtt': ['first', 'Arn'] },
        '/invocations'  // eslint-disable-line comma-dangle
      ]]                // eslint-disable-line comma-dangle
    };

    return awsCompileApigEvents.compileMethods().then(() => {
      expect(
        JSON.stringify(awsCompileApigEvents.serverless.service.resources
          .Resources.PostMethodApigEvent0.Properties.Integration.Uri
      )).to.equal(JSON.stringify(lambdaUriObject));
      expect(
        JSON.stringify(awsCompileApigEvents.serverless.service.resources
          .Resources.GetMethodApigEvent1.Properties.Integration.Uri
      )).to.equal(JSON.stringify(lambdaUriObject));
    });
  });
});
