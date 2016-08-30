'use strict';

const path = require('path');
const expect = require('chai').expect;
const AwsCompileApigEvents = require('../index');
const Serverless = require('../../../../../../../Serverless');
const testUtils = require('../../../../../../../../tests/utils');

describe('#compileMethods()', () => {
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

  describe('when dealing with request configuration', () => {
    it('should setup a default "application/json" template', () =>
      awsCompileApigEvents.compileMethods().then(() => {
        expect(awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.GetMethodApigEvent1.Properties
          .Integration.RequestTemplates['application/json']
        ).to.have.length.above(0);
      })
    );

    it('should setup a default "application/x-www-form-urlencoded" template', () =>
      awsCompileApigEvents.compileMethods().then(() => {
        expect(awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.GetMethodApigEvent1.Properties
          .Integration.RequestTemplates['application/x-www-form-urlencoded']
        ).to.have.length.above(0);
      })
    );

    it('should set custom request templates', () => {
      const tmpDirPath = testUtils.getTmpDirPath();
      const requestTemplate1 = path.join(tmpDirPath, 'template-1.vm');
      const requestTemplate2 = path.join(tmpDirPath, 'template-2.vm');

      serverless.utils.writeFileSync(requestTemplate1, 'content-of-template-1');
      serverless.utils.writeFileSync(requestTemplate2, 'content-of-template-2');

      awsCompileApigEvents.serverless.service.functions = {
        first: {
          events: [
            {
              http: {
                method: 'GET',
                path: 'users/list',
                request: {
                  template: {
                    'template/1': requestTemplate1,
                    'template/2': requestTemplate2,
                  },
                },
              },
            },
          ],
        },
      };

      return awsCompileApigEvents.compileMethods().then(() => {
        expect(awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.GetMethodApigEvent1.Properties
          .Integration.RequestTemplates['template/1']
        ).to.equal('content-of-template-1');

        expect(awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.GetMethodApigEvent1.Properties
          .Integration.RequestTemplates['template/2']
        ).to.equal('content-of-template-2');
      });
    });

    it('should be possible to overwrite default request templates', () => {
      const tmpDirPath = testUtils.getTmpDirPath();
      const requestTemplate = path.join(tmpDirPath, 'template.vm');

      serverless.utils.writeFileSync(requestTemplate, 'overwritten-request-template-content');

      awsCompileApigEvents.serverless.service.functions = {
        first: {
          events: [
            {
              http: {
                method: 'GET',
                path: 'users/list',
                request: {
                  template: {
                    'application/json': requestTemplate,
                  },
                },
              },
            },
          ],
        },
      };

      return awsCompileApigEvents.compileMethods().then(() => {
        expect(awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.GetMethodApigEvent1.Properties
          .Integration.RequestTemplates['application/json']
        ).to.equal('overwritten-request-template-content');
      });
    });
  });

  describe('when dealing with response configuration', () => {
    it('should set the custom headers', () => {
      awsCompileApigEvents.serverless.service.functions = {
        first: {
          events: [
            {
              http: {
                method: 'GET',
                path: 'users/list',
                response: {
                  headers: {
                    'Content-Type': 'text/plain',
                    'My-Custom-Header': 'my/custom/header',
                  },
                },
              },
            },
          ],
        },
      };

      return awsCompileApigEvents.compileMethods().then(() => {
        expect(
          awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate
            .Resources.GetMethodApigEvent1.Properties.Integration.IntegrationResponses[0]
            .ResponseParameters['method.response.header.Content-Type']
        ).to.equal("'text/plain'");
        expect(
          awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate
            .Resources.GetMethodApigEvent1.Properties.Integration.IntegrationResponses[0]
            .ResponseParameters['method.response.header.My-Custom-Header']
        ).to.equal("'my/custom/header'");
      });
    });

    it('should set the custom template', () => {
      awsCompileApigEvents.serverless.service.functions = {
        first: {
          events: [
            {
              http: {
                method: 'GET',
                path: 'users/list',
                response: {
                  template: "$input.path('$.foo')",
                },
              },
            },
          ],
        },
      };

      return awsCompileApigEvents.compileMethods().then(() => {
        expect(
          awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate
            .Resources.GetMethodApigEvent1.Properties.Integration.IntegrationResponses[0]
            .ResponseTemplates['application/json']
        ).to.equal("$input.path('$.foo')");
      });
    });
  });
});
