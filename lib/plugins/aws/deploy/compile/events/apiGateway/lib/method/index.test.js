'use strict';

const expect = require('chai').expect;
const AwsCompileApigEvents = require('../../index');
const Serverless = require('../../../../../../../../Serverless');
const AwsProvider = require('../../../../../../provider/awsProvider');

describe('#compileMethods()', () => {
  let serverless;
  let awsCompileApigEvents;

  beforeEach(() => {
    serverless = new Serverless();
    serverless.setProvider('aws', new AwsProvider(serverless));
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
    awsCompileApigEvents.validated = {};
    awsCompileApigEvents.apiGatewayRestApiLogicalId = 'ApiGatewayRestApi';
    awsCompileApigEvents.apiGatewayResourceLogicalIds = {
      'users/create': 'ApiGatewayResourceUsersCreate',
      'users/list': 'ApiGatewayResourceUsersList',
      'users/update': 'ApiGatewayResourceUsersUpdate',
      'users/delete': 'ApiGatewayResourceUsersDelete',
    };
    awsCompileApigEvents.apiGatewayResourceNames = {
      'users/create': 'UsersCreate',
      'users/list': 'UsersList',
      'users/update': 'UsersUpdate',
      'users/delete': 'UsersDelete',
    };
  });

  it('should have request parameters defined when they are set', () => {
    awsCompileApigEvents.validated.events = [
      {
        functionName: 'First',
        http: {
          path: 'users/create',
          method: 'post',
          integration: 'AWS',
          request: {
            parameters: {
              'method.request.querystring.foo': true,
              'method.request.querystring.bar': false,
              'method.request.header.foo': true,
              'method.request.header.bar': false,
              'method.request.path.foo': true,
              'method.request.path.bar': false,
            },
          },
          response: {
            statusCodes: {
              200: {
                pattern: '',
              },
            },
          },
        },
      },
    ];
    return awsCompileApigEvents.compileMethods().then(() => {
      expect(
        awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.ApiGatewayMethodUsersCreatePost.Properties
          .RequestParameters['method.request.header.foo']
      ).to.equal(true);
      expect(
        awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.ApiGatewayMethodUsersCreatePost.Properties
          .RequestParameters['method.request.header.bar']
      ).to.equal(false);
      expect(
        awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.ApiGatewayMethodUsersCreatePost.Properties
          .RequestParameters['method.request.querystring.foo']
      ).to.equal(true);
      expect(
        awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.ApiGatewayMethodUsersCreatePost.Properties
          .RequestParameters['method.request.querystring.bar']
      ).to.equal(false);
      expect(
        awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.ApiGatewayMethodUsersCreatePost.Properties
          .RequestParameters['method.request.path.foo']
      ).to.equal(true);
      expect(
        awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.ApiGatewayMethodUsersCreatePost.Properties
          .RequestParameters['method.request.path.bar']
      ).to.equal(false);
    });
  });

  it('should create method resources when http events given', () => {
    awsCompileApigEvents.validated.events = [
      {
        functionName: 'First',
        http: {
          path: 'users/create',
          method: 'post',
        },
      },
      {
        functionName: 'Second',
        http: {
          method: 'get',
          path: 'users/list',
        },
      },
    ];
    return awsCompileApigEvents.compileMethods().then(() => {
      expect(
        awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.ApiGatewayMethodUsersCreatePost.Type
      ).to.equal('AWS::ApiGateway::Method');
      expect(
        awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.ApiGatewayMethodUsersListGet.Type
      ).to.equal('AWS::ApiGateway::Method');
    });
  });

  it('should set authorizer config if given as ARN string', () => {
    awsCompileApigEvents.validated.events = [
      {
        functionName: 'First',
        http: {
          authorizer: {
            name: 'Authorizer',
          },
          path: 'users/create',
          method: 'post',
        },
      },
    ];
    return awsCompileApigEvents.compileMethods().then(() => {
      expect(
        awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.ApiGatewayMethodUsersCreatePost.Properties.AuthorizationType
      ).to.equal('CUSTOM');

      expect(
        awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.ApiGatewayMethodUsersCreatePost.Properties.AuthorizerId.Ref
      ).to.equal('AuthorizerApiGatewayAuthorizer');
    });
  });

  it('should set authorizer config for a cognito user pool', () => {
    awsCompileApigEvents.validated.events = [
      {
        functionName: 'First',
        http: {
          authorizer: {
            name: 'authorizer',
            arn: 'arn:aws:cognito-idp:us-east-1:xxx:userpool/us-east-1_ZZZ',
          },
          integration: 'AWS',
          path: 'users/create',
          method: 'post',
        },
      },
    ];

    return awsCompileApigEvents.compileMethods().then(() => {
      expect(
        awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.ApiGatewayMethodUsersCreatePost.Properties.AuthorizationType
      ).to.equal('COGNITO_USER_POOLS');

      expect(
        awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.ApiGatewayMethodUsersCreatePost.Properties.AuthorizerId.Ref
      ).to.equal('AuthorizerApiGatewayAuthorizer');

      expect(
        awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.ApiGatewayMethodUsersCreatePost.Properties
          .Integration.RequestTemplates['application/json']
          ).to.not.match(/undefined/);
    });
  });

  it('should set claims for a cognito user pool', () => {
    awsCompileApigEvents.validated.events = [
      {
        functionName: 'First',
        http: {
          authorizer: {
            name: 'authorizer',
            arn: 'arn:aws:cognito-idp:us-east-1:xxx:userpool/us-east-1_ZZZ',
            claims: ['email'],
          },
          integration: 'AWS',
          path: 'users/create',
          method: 'post',
        },
      },
    ];

    return awsCompileApigEvents.compileMethods().then(() => {
      expect(
        awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.ApiGatewayMethodUsersCreatePost.Properties
          .Integration.RequestTemplates['application/json']
          ).to.match(/email/);
    });
  });

  it('should replace the extra claims in the template if there are none', () => {
    awsCompileApigEvents.validated.events = [
      {
        functionName: 'First',
        http: {
          authorizer: {
            name: 'authorizer',
            arn: 'arn:aws:cognito-idp:us-east-1:xxx:userpool/us-east-1_ZZZ',
          },
          integration: 'AWS',
          path: 'users/create',
          method: 'post',
        },
      },
    ];

    return awsCompileApigEvents.compileMethods().then(() => {
      expect(
        awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.ApiGatewayMethodUsersCreatePost.Properties
          .Integration.RequestTemplates['application/json']
          ).to.not.match(/extraCognitoPoolClaims/);
    });
  });

  it('should not create method resources when http events are not given', () => {
    awsCompileApigEvents.validated.events = [];

    return awsCompileApigEvents.compileMethods().then(() => {
      expect(
        awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate.Resources
      ).to.deep.equal({});
    });
  });

  it('should create methodLogicalIds array', () => {
    awsCompileApigEvents.validated.events = [
      {
        functionName: 'First',
        http: {
          path: 'users/create',
          method: 'post',
        },
      },
      {
        functionName: 'Second',
        http: {
          method: 'get',
          path: 'users/list',
        },
      },
    ];
    return awsCompileApigEvents.compileMethods().then(() => {
      expect(awsCompileApigEvents.apiGatewayMethodLogicalIds.length).to.equal(2);
    });
  });

  it('should set api key as required if private endpoint', () => {
    awsCompileApigEvents.validated.events = [
      {
        functionName: 'First',
        http: {
          path: 'users/create',
          method: 'post',
          private: true,
        },
      },
    ];
    return awsCompileApigEvents.compileMethods().then(() => {
      expect(
        awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.ApiGatewayMethodUsersCreatePost.Properties.ApiKeyRequired
      ).to.equal(true);
    });
  });

  it('should set the correct lambdaUri', () => {
    awsCompileApigEvents.validated.events = [
      {
        functionName: 'First',
        http: {
          path: 'users/create',
          method: 'post',
        },
      },
      {
        functionName: 'Second',
        http: {
          method: 'get',
          path: 'users/list',
        },
      },
    ];
    return awsCompileApigEvents.compileMethods().then(() => {
      expect(awsCompileApigEvents.serverless.service
        .provider.compiledCloudFormationTemplate.Resources
        .ApiGatewayMethodUsersCreatePost.Properties.Integration.Uri
      ).to.deep.equal({
        'Fn::Join': [
          '', [
            'arn:aws:apigateway:', { Ref: 'AWS::Region' },
            ':lambda:path/2015-03-31/functions/', { 'Fn::GetAtt': ['FirstLambdaFunction', 'Arn'] },
            '/invocations',
          ],
        ],
      });
      expect(awsCompileApigEvents.serverless.service
        .provider.compiledCloudFormationTemplate.Resources
        .ApiGatewayMethodUsersListGet.Properties.Integration.Uri
      ).to.deep.equal({
        'Fn::Join': [
          '', [
            'arn:aws:apigateway:', { Ref: 'AWS::Region' },
            ':lambda:path/2015-03-31/functions/', { 'Fn::GetAtt': ['SecondLambdaFunction', 'Arn'] },
            '/invocations',
          ],
        ],
      });
    });
  });

  it('should add CORS origins to method only when CORS is enabled', () => {
    awsCompileApigEvents.validated.events = [
      {
        functionName: 'First',
        http: {
          path: 'users/create',
          method: 'post',
          integration: 'AWS',
          cors: {
            origins: ['*'],
          },
          response: {
            statusCodes: {
              200: {
                pattern: '',
              },
            },
          },
        },
      },
      {
        functionName: 'Second',
        http: {
          method: 'get',
          path: 'users/list',
          integration: 'AWS',
          response: {
            statusCodes: {
              200: {
                pattern: '',
              },
            },
          },
        },
      },
      {
        functionName: 'Third',
        http: {
          path: 'users/update',
          method: 'PUT',
          integration: 'AWS',
          response: {
            statusCodes: {
              200: {
                pattern: '',
              },
            },
          },
          cors: {
            origins: ['*'],
          },
        },
      },
    ];
    return awsCompileApigEvents.compileMethods().then(() => {
      // Check origin.
      expect(
        awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.ApiGatewayMethodUsersCreatePost.Properties
          .Integration.IntegrationResponses[0]
          .ResponseParameters['method.response.header.Access-Control-Allow-Origin']
      ).to.equal('\'*\'');

      // CORS not enabled!
      expect(
        awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.ApiGatewayMethodUsersListGet.Properties
          .Integration.IntegrationResponses[0]
          .ResponseParameters['method.response.header.Access-Control-Allow-Origin']
      ).to.not.equal('\'*\'');

      expect(
        awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.ApiGatewayMethodUsersUpdatePut.Properties
          .Integration.IntegrationResponses[0]
          .ResponseParameters['method.response.header.Access-Control-Allow-Origin']
      ).to.equal('\'*\'');
    });
  });

  describe('when dealing with request configuration', () => {
    it('should setup a default "application/json" template', () => {
      awsCompileApigEvents.validated.events = [
        {
          functionName: 'Second',
          http: {
            method: 'get',
            path: 'users/list',
            integration: 'AWS',
            response: {
              statusCodes: {
                200: {
                  pattern: '',
                },
              },
            },
          },
        },
      ];
      return awsCompileApigEvents.compileMethods().then(() => {
        expect(awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.ApiGatewayMethodUsersListGet.Properties
          .Integration.RequestTemplates['application/json']
        ).to.have.length.above(0);
      });
    });

    it('should setup a default "application/x-www-form-urlencoded" template', () => {
      awsCompileApigEvents.validated.events = [
        {
          functionName: 'Second',
          http: {
            method: 'get',
            path: 'users/list',
            integration: 'AWS',
            response: {
              statusCodes: {
                200: {
                  pattern: '',
                },
              },
            },
          },
        },
      ];
      return awsCompileApigEvents.compileMethods().then(() => {
        expect(awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.ApiGatewayMethodUsersListGet.Properties
          .Integration.RequestTemplates['application/x-www-form-urlencoded']
        ).to.have.length.above(0);
      });
    });

    it('should use defined pass-through behavior', () => {
      awsCompileApigEvents.validated.events = [
        {
          functionName: 'First',
          http: {
            method: 'GET',
            path: 'users/list',
            integration: 'AWS',
            request: {
              passThrough: 'WHEN_NO_TEMPLATES',
            },
            response: {
              statusCodes: {
                200: {
                  pattern: '',
                },
              },
            },
          },
        },
      ];
      return awsCompileApigEvents.compileMethods().then(() => {
        expect(awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.ApiGatewayMethodUsersListGet.Properties.Integration.PassthroughBehavior
        ).to.equal('WHEN_NO_TEMPLATES');
      });
    });

    it('should set custom request templates', () => {
      awsCompileApigEvents.validated.events = [
        {
          functionName: 'First',
          http: {
            method: 'GET',
            path: 'users/list',
            integration: 'AWS',
            request: {
              template: {
                'template/1': '{ "stage" : "$context.stage" }',
                'template/2': '{ "httpMethod" : "$context.httpMethod" }',
              },
            },
            response: {
              statusCodes: {
                200: {
                  pattern: '',
                },
              },
            },
          },
        },
      ];
      return awsCompileApigEvents.compileMethods().then(() => {
        expect(awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.ApiGatewayMethodUsersListGet.Properties
          .Integration.RequestTemplates['template/1']
        ).to.equal('{ "stage" : "$context.stage" }');

        expect(awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.ApiGatewayMethodUsersListGet.Properties
          .Integration.RequestTemplates['template/2']
        ).to.equal('{ "httpMethod" : "$context.httpMethod" }');
      });
    });

    it('should be possible to overwrite default request templates', () => {
      awsCompileApigEvents.validated.events = [
        {
          functionName: 'First',
          http: {
            method: 'GET',
            path: 'users/list',
            integration: 'AWS',
            request: {
              template: {
                'application/json': 'overwritten-request-template-content',
              },
            },
            response: {
              statusCodes: {
                200: {
                  pattern: '',
                },
              },
            },
          },
        },
      ];
      return awsCompileApigEvents.compileMethods().then(() => {
        expect(awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.ApiGatewayMethodUsersListGet.Properties
          .Integration.RequestTemplates['application/json']
        ).to.equal('overwritten-request-template-content');
      });
    });
  });

  describe('when dealing with response configuration', () => {
    it('should set the custom headers', () => {
      awsCompileApigEvents.validated.events = [
        {
          functionName: 'First',
          http: {
            method: 'GET',
            path: 'users/list',
            integration: 'AWS',
            response: {
              statusCodes: {
                200: {
                  pattern: '',
                  headers: {
                    'Content-Type': "'text/plain'",
                    'My-Custom-Header': 'my/custom/header',
                  },
                },
              },
            },
          },
        },
      ];
      return awsCompileApigEvents.compileMethods().then(() => {
        expect(
          awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate
            .Resources.ApiGatewayMethodUsersListGet.Properties.Integration.IntegrationResponses[0]
            .ResponseParameters['method.response.header.Content-Type']
        ).to.equal("'text/plain'");
        expect(
          awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate
            .Resources.ApiGatewayMethodUsersListGet.Properties.Integration.IntegrationResponses[0]
            .ResponseParameters['method.response.header.My-Custom-Header']
        ).to.equal('my/custom/header');
      });
    });

    it('should set the custom template', () => {
      awsCompileApigEvents.validated.events = [
        {
          functionName: 'First',
          http: {
            method: 'GET',
            path: 'users/list',
            integration: 'AWS',
            response: {
              statusCodes: {
                200: {
                  template: "$input.path('$.foo')",
                  pattern: '',
                },
              },
            },
          },
        },
      ];
      return awsCompileApigEvents.compileMethods().then(() => {
        expect(
          awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate
            .Resources.ApiGatewayMethodUsersListGet.Properties.Integration.IntegrationResponses[0]
            .ResponseTemplates['application/json']
        ).to.equal("$input.path('$.foo')");
      });
    });
  });

  it('should add method responses for different status codes', () => {
    awsCompileApigEvents.validated.events = [
      {
        functionName: 'First',
        http: {
          method: 'get',
          path: 'users/list',
          integration: 'AWS',
          response: {
            statusCodes: {
              200: {
                pattern: '',
              },
              202: {
                pattern: 'foo',
              },
            },
          },
        },
      },
    ];
    return awsCompileApigEvents.compileMethods().then(() => {
      expect(
        awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.ApiGatewayMethodUsersListGet.Properties.MethodResponses[0].StatusCode
      ).to.equal(200);
      expect(
        awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.ApiGatewayMethodUsersListGet.Properties.MethodResponses[1].StatusCode
      ).to.equal(202);
    });
  });

  it('should add integration responses for different status codes', () => {
    awsCompileApigEvents.validated.events = [
      {
        functionName: 'First',
        http: {
          method: 'get',
          path: 'users/list',
          integration: 'AWS',
          response: {
            statusCodes: {
              200: {
                pattern: '',
              },
              202: {
                pattern: 'foo',
              },
            },
          },
        },
      },
    ];
    return awsCompileApigEvents.compileMethods().then(() => {
      expect(
        awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.ApiGatewayMethodUsersListGet.Properties.Integration.IntegrationResponses[1]
      ).to.deep.equal({
        StatusCode: 202,
        SelectionPattern: 'foo',
        ResponseParameters: {},
        ResponseTemplates: {},
      });
      expect(
        awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.ApiGatewayMethodUsersListGet.Properties.Integration.IntegrationResponses[0]
      ).to.deep.equal({
        StatusCode: 200,
        SelectionPattern: '',
        ResponseParameters: {},
        ResponseTemplates: {},
      });
    });
  });

  it('should add fall back headers and template to statusCodes', () => {
    awsCompileApigEvents.validated.events = [
      {
        functionName: 'First',
        http: {
          method: 'GET',
          path: 'users/list',
          integration: 'AWS',
          response: {
            headers: {
              'Content-Type': 'text/csv',
            },
            template: 'foo',
            statusCodes: {
              400: {
                pattern: '',
              },
            },
          },
        },
      },
    ];
    return awsCompileApigEvents.compileMethods().then(() => {
      expect(
        awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.ApiGatewayMethodUsersListGet.Properties.Integration.IntegrationResponses[0]
          .ResponseTemplates['application/json']
      ).to.equal('foo');
      expect(
        awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.ApiGatewayMethodUsersListGet.Properties.Integration.IntegrationResponses[0]
          .ResponseParameters['method.response.header.Content-Type']
      ).to.equal('text/csv');
    });
  });

  it('should add custom response codes', () => {
    awsCompileApigEvents.validated.events = [
      {
        functionName: 'First',
        http: {
          method: 'GET',
          path: 'users/list',
          integration: 'AWS',
          response: {
            statusCodes: {
              200: {
                pattern: '',
                template: '$input.path(\'$.foo\')',
              },
              404: {
                pattern: '.*"statusCode":404,.*',
                template: '$input.path(\'$.errorMessage\')',
                headers: {
                  'Content-Type': 'text/html',
                },
              },
            },
          },
        },
      },
    ];
    return awsCompileApigEvents.compileMethods().then(() => {
      expect(
        awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.ApiGatewayMethodUsersListGet.Properties.Integration.IntegrationResponses[0]
          .ResponseTemplates['application/json']
      ).to.equal("$input.path('$.foo')");
      expect(
        awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.ApiGatewayMethodUsersListGet.Properties.Integration.IntegrationResponses[0]
          .SelectionPattern
      ).to.equal('');
      expect(
        awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.ApiGatewayMethodUsersListGet.Properties.Integration.IntegrationResponses[1]
          .ResponseTemplates['application/json']
      ).to.equal("$input.path('$.errorMessage')");
      expect(
        awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.ApiGatewayMethodUsersListGet.Properties.Integration.IntegrationResponses[1]
          .SelectionPattern
      ).to.equal('.*"statusCode":404,.*');
      expect(
        awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.ApiGatewayMethodUsersListGet.Properties.Integration.IntegrationResponses[1]
          .ResponseParameters['method.response.header.Content-Type']
      ).to.equal('text/html');
    });
  });

  it('should add multiple response templates for a custom response codes', () => {
    awsCompileApigEvents.validated.events = [
      {
        functionName: 'First',
        http: {
          method: 'GET',
          path: 'users/list',
          integration: 'AWS',
          response: {
            statusCodes: {
              200: {
                template: '$input.path(\'$.foo\')',
                headers: {
                  'Content-Type': 'text/csv',
                },
              },
              404: {
                pattern: '.*"statusCode":404,.*',
                template: {
                  'application/json': '$input.path(\'$.errorMessage\')',
                  'application/xml': '$input.path(\'$.xml.errorMessage\')',
                },
                headers: {
                  'Content-Type': 'text/html',
                },
              },
            },
          },
        },
      },
    ];
    return awsCompileApigEvents.compileMethods().then(() => {
      expect(
        awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.ApiGatewayMethodUsersListGet.Properties.Integration.IntegrationResponses[0]
          .ResponseTemplates['application/json']
      ).to.equal("$input.path('$.foo')");
      expect(
        awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.ApiGatewayMethodUsersListGet.Properties.Integration.IntegrationResponses[0]
          .SelectionPattern
      ).to.equal('');
      expect(
        awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.ApiGatewayMethodUsersListGet.Properties.Integration.IntegrationResponses[0]
          .ResponseParameters['method.response.header.Content-Type']
      ).to.equal('text/csv');
      expect(
        awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.ApiGatewayMethodUsersListGet.Properties.Integration.IntegrationResponses[1]
          .ResponseTemplates['application/json']
      ).to.equal("$input.path('$.errorMessage')");
      expect(
        awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.ApiGatewayMethodUsersListGet.Properties.Integration.IntegrationResponses[1]
          .ResponseTemplates['application/xml']
      ).to.equal("$input.path('$.xml.errorMessage')");
      expect(
        awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.ApiGatewayMethodUsersListGet.Properties.Integration.IntegrationResponses[1]
          .SelectionPattern
      ).to.equal('.*"statusCode":404,.*');
      expect(
        awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.ApiGatewayMethodUsersListGet.Properties.Integration.IntegrationResponses[1]
          .ResponseParameters['method.response.header.Content-Type']
      ).to.equal('text/html');
    });
  });

  it('should handle root resource methods', () => {
    awsCompileApigEvents.validated.events = [
      {
        functionName: 'First',
        http: {
          path: '',
          method: 'GET',
        },
      },
    ];
    return awsCompileApigEvents.compileMethods().then(() => {
      expect(awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate
        .Resources.ApiGatewayMethodGet.Properties.ResourceId).to.deep.equal({
          'Fn::GetAtt': [
            'ApiGatewayRestApi',
            'RootResourceId',
          ],
        });
    });
  });
});
