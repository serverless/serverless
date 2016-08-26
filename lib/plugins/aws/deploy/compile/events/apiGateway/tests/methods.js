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
    serverless.service.provider.compiledCloudFormationTemplate = { Resources: {}, Mappings: {} };
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
              cors: true,
            },
          },
          {
            http: 'GET users/list',
          },
          {
            http: {
              path: 'users/update',
              method: 'PUT',
              cors: {
                origins: ['*'],
                headers: ['Content-Type', 'X-Amz-Date', 'Authorization', 'X-Api-Key'],
              },
            },
          },
        ],
      },
    };
    awsCompileApigEvents.resourceLogicalIds = {
      'users/create': 'ResourceApigEvent0',
      'users/list': 'ResourceApigEvent1',
      'users/update': 'ResourceApigEvent2',
    };
  });

  it('should throw an error if http event type is not a string or an object', () => {
    awsCompileApigEvents.serverless.service.functions = {
      first: {
        events: [
          {
            http: 42,
          },
        ],
      },
    };

    expect(() => awsCompileApigEvents.compileMethods()).to.throw(Error);
  });

  it('should create method resources when http events given', () => awsCompileApigEvents
    .compileMethods().then(() => {
      expect(
        awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.PostMethodApigEvent0.Type
      ).to.equal('AWS::ApiGateway::Method');
      expect(
        awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.GetMethodApigEvent1.Type
      ).to.equal('AWS::ApiGateway::Method');
      expect(
        awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.PutMethodApigEvent2.Type
      ).to.equal('AWS::ApiGateway::Method');
    })
  );

  it('should set authorizer config if given as string', () => {
    awsCompileApigEvents.serverless.service.functions
      .first.events[0].http.authorizer = 'authorizer';

    return awsCompileApigEvents.compileMethods().then(() => {
      expect(
        awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.PostMethodApigEvent0.Properties.AuthorizationType
      ).to.equal('CUSTOM');

      expect(
        awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.PostMethodApigEvent0.Properties.AuthorizerId.Ref
      ).to.equal('authorizerAuthorizer');
    });
  });

  it('should set authorizer config if given as ARN string', () => {
    awsCompileApigEvents.serverless.service.functions
      .first.events[0].http.authorizer = 'xxx:dev-authorizer';

    return awsCompileApigEvents.compileMethods().then(() => {
      expect(
        awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.PostMethodApigEvent0.Properties.AuthorizationType
      ).to.equal('CUSTOM');

      expect(
        awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.PostMethodApigEvent0.Properties.AuthorizerId.Ref
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
        awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.PostMethodApigEvent0.Properties.AuthorizationType
      ).to.equal('CUSTOM');

      expect(
        awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.PostMethodApigEvent0.Properties.AuthorizerId.Ref
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
        awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.PostMethodApigEvent0.Properties.AuthorizationType
      ).to.equal('CUSTOM');

      expect(
        awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.PostMethodApigEvent0.Properties.AuthorizerId.Ref
      ).to.equal('authorizerAuthorizer');
    });
  });

  it('should create methodDependencies array', () => awsCompileApigEvents
    .compileMethods().then(() => {
      expect(awsCompileApigEvents.methodDependencies.length).to.equal(3);
    }));

  it('should not create method resources when http events are not given', () => {
    awsCompileApigEvents.serverless.service.functions = {
      first: {
        events: [],
      },
    };

    return awsCompileApigEvents.compileMethods().then(() => {
      expect(
        awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate.Resources
      ).to.deep.equal({});
    });
  });

  it('should set api key as required if private endpoint', () => {
    awsCompileApigEvents.serverless.service.functions
      .first.events[0].http.private = true;

    return awsCompileApigEvents.compileMethods().then(() => {
      expect(
        awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.PostMethodApigEvent0.Properties.ApiKeyRequired
      ).to.equal(true);
    });
  });

  it('should set the correct lambdaUri', () => {
    const lambdaUriObject = {
      'Fn::Join': [
        '', [
          'arn:aws:apigateway:', { Ref: 'AWS::Region' },
          ':lambda:path/2015-03-31/functions/', { 'Fn::GetAtt': ['first', 'Arn'] },
          '/invocations',
        ],
      ],
    };

    return awsCompileApigEvents.compileMethods().then(() => {
      expect(
        JSON.stringify(awsCompileApigEvents.serverless.service
          .provider.compiledCloudFormationTemplate.Resources
          .PostMethodApigEvent0.Properties.Integration.Uri
      )).to.equal(JSON.stringify(lambdaUriObject));
      expect(
        JSON.stringify(awsCompileApigEvents.serverless.service
          .provider.compiledCloudFormationTemplate.Resources
          .GetMethodApigEvent1.Properties.Integration.Uri
      )).to.equal(JSON.stringify(lambdaUriObject));
    });
  });

  it('should add CORS origins to method only when CORS is enabled', () => {
    const origin = '\'*\'';

    return awsCompileApigEvents.compileMethods().then(() => {
      // Check origin.
      expect(
        awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.PostMethodApigEvent0.Properties
          .Integration.IntegrationResponses[0]
          .ResponseParameters['method.response.header.Access-Control-Allow-Origin']
      ).to.equal(origin);

      // CORS not enabled!
      expect(
        awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.GetMethodApigEvent1.Properties
          .Integration.IntegrationResponses[0]
          .ResponseParameters['method.response.header.Access-Control-Allow-Origin']
      ).to.not.equal(origin);

      expect(
        awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.PutMethodApigEvent2.Properties
          .Integration.IntegrationResponses[0]
          .ResponseParameters['method.response.header.Access-Control-Allow-Origin']
      ).to.equal(origin);
    });
  });

  it('should create preflight method for CORS enabled resource', () => {
    const origin = '\'*\'';
    const headers = '\'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token\'';

    return awsCompileApigEvents.compileMethods().then(() => {
      expect(
        awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.PreflightMethodApigEvent0.Properties.Integration.IntegrationResponses[0]
          .ResponseParameters['method.response.header.Access-Control-Allow-Origin']
      ).to.equal(origin);

      expect(
        awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.PreflightMethodApigEvent0.Properties.Integration.IntegrationResponses[0]
          .ResponseParameters['method.response.header.Access-Control-Allow-Headers']
      ).to.equal(headers);

      expect(
        awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.PreflightMethodApigEvent0.Properties.Integration.IntegrationResponses[0]
          .ResponseParameters['method.response.header.Access-Control-Allow-Methods']
      ).to.equal('\'OPTIONS,POST\'');

      expect(
        awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.PreflightMethodApigEvent1.Properties.Integration.IntegrationResponses[0]
          .ResponseParameters['method.response.header.Access-Control-Allow-Origin']
      ).to.equal(origin);

      expect(
        awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.PreflightMethodApigEvent1.Properties.Integration.IntegrationResponses[0]
          .ResponseParameters['method.response.header.Access-Control-Allow-Headers']
      ).to.equal(headers);

      expect(
        awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.PreflightMethodApigEvent1.Properties.Integration.IntegrationResponses[0]
          .ResponseParameters['method.response.header.Access-Control-Allow-Methods']
      ).to.equal('\'OPTIONS,PUT\'');
    });
  });

  it('should merge the request template into the "Mappings" section', () => awsCompileApigEvents
    .compileMethods().then(() => {
      expect(
        awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Mappings.ApiGateway.RequestTemplates
      ).to.not.deep.equal({});
    })
  );

  it('should reference the request templates for the different content types', () => {
    const findInMapForJson = {
      'Fn::FindInMap': [
        'ApiGateway',
        'RequestTemplates',
        'Json',
      ],
    };

    awsCompileApigEvents.compileMethods().then(() => {
      // application/json
      expect(
        awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.PostMethodApigEvent0.Properties.Integration
          .RequestTemplates['application/json']
      ).to.deep.equal(findInMapForJson);

      const findInMapForFormUrlEncoded = {
        'Fn::FindInMap': [
          'ApiGateway',
          'RequestTemplates',
          'FormUrlEncoded',
        ],
      };

      // application/x-www-form-urlencoded
      expect(
        awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.PostMethodApigEvent0.Properties.Integration
          .RequestTemplates['application/x-www-form-urlencoded']
      ).to.deep.equal(findInMapForFormUrlEncoded);
    });
  });
});
