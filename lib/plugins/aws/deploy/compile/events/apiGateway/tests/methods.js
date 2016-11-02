'use strict';

const expect = require('chai').expect;
const sinon = require('sinon');
const AwsCompileApigEvents = require('../index');
const Serverless = require('../../../../../../../Serverless');

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
              },
            },
          },
          {
            http: {
              path: 'users/delete',
              method: 'DELETE',
              cors: {
                origins: ['*'],
                headers: ['CustomHeaderA', 'CustomHeaderB'],
              },
            },
          },
        ],
      },
    };
    awsCompileApigEvents.resourceLogicalIds = {
      'users/create': 'ApiGatewayResourceUsersCreate',
      'users/list': 'ApiGatewayResourceUsersList',
      'users/update': 'ApiGatewayResourceUsersUpdate',
      'users/delete': 'ApiGatewayResourceUsersDelete',
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

  it('should have request parameters defined when they are set', () => {
    awsCompileApigEvents.serverless.service.functions.first.events[0].http.integration = 'lambda';

    const requestConfig = {
      parameters: {
        querystrings: {
          foo: true,
          bar: false,
        },
        headers: {
          foo: true,
          bar: false,
        },
        paths: {
          foo: true,
          bar: false,
        },
      },
    };

    awsCompileApigEvents.serverless.service.functions.first.events[0].http.request = requestConfig;

    awsCompileApigEvents.compileMethods().then(() => {
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

  it('should create method resources when http events given', () => awsCompileApigEvents
    .compileMethods().then(() => {
      expect(
        awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.ApiGatewayMethodUsersCreatePost.Type
      ).to.equal('AWS::ApiGateway::Method');
      expect(
        awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.ApiGatewayMethodUsersListGet.Type
      ).to.equal('AWS::ApiGateway::Method');
      expect(
        awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.ApiGatewayMethodUsersUpdatePut.Type
      ).to.equal('AWS::ApiGateway::Method');
    })
  );

  it('should set authorizer', () => {
    awsCompileApigEvents.serverless.service.functions
      .first.events[0].http.authorizer = {
        name: 'authorizer',
      };

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

  it('should create methodDependencies array', () => awsCompileApigEvents
    .compileMethods().then(() => {
      expect(awsCompileApigEvents.methodDependencies.length).to.equal(4);
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
          .Resources.ApiGatewayMethodUsersCreatePost.Properties.ApiKeyRequired
      ).to.equal(true);
    });
  });

  it('should set the correct lambdaUri', () => {
    const lambdaUriObject = {
      'Fn::Join': [
        '', [
          'arn:aws:apigateway:', { Ref: 'AWS::Region' },
          ':lambda:path/2015-03-31/functions/', { 'Fn::GetAtt': ['FirstLambdaFunction', 'Arn'] },
          '/invocations',
        ],
      ],
    };

    return awsCompileApigEvents.compileMethods().then(() => {
      expect(
        JSON.stringify(awsCompileApigEvents.serverless.service
          .provider.compiledCloudFormationTemplate.Resources
          .ApiGatewayMethodUsersCreatePost.Properties.Integration.Uri
      )).to.equal(JSON.stringify(lambdaUriObject));
      expect(
        JSON.stringify(awsCompileApigEvents.serverless.service
          .provider.compiledCloudFormationTemplate.Resources
          .ApiGatewayMethodUsersListGet.Properties.Integration.Uri
      )).to.equal(JSON.stringify(lambdaUriObject));
    });
  });

  it('should add CORS origins to method only when CORS and LAMBDA integration are enabled', () => {
    const origin = '\'*\'';

    awsCompileApigEvents.serverless.service.functions = {
      first: {
        events: [
          {
            http: {
              path: 'users/create',
              method: 'POST',
              integration: 'lambda',
              cors: true,
            },
          },
          {
            http: {
              path: 'users/list',
              method: 'GET',
              integration: 'lambda',
            },
          },
          {
            http: {
              path: 'users/update',
              method: 'PUT',
              integration: 'lambda',
              cors: {
                origins: ['*'],
              },
            },
          },
        ],
      },
    };

    return awsCompileApigEvents.compileMethods().then(() => {
      // Check origin.
      expect(
        awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.ApiGatewayMethodUsersCreatePost.Properties
          .Integration.IntegrationResponses[0]
          .ResponseParameters['method.response.header.Access-Control-Allow-Origin']
      ).to.equal(origin);

      // CORS not enabled!
      expect(
        awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.ApiGatewayMethodUsersListGet.Properties
          .Integration.IntegrationResponses[0]
          .ResponseParameters['method.response.header.Access-Control-Allow-Origin']
      ).to.not.equal(origin);

      expect(
        awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.ApiGatewayMethodUsersUpdatePut.Properties
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
          .Resources.ApiGatewayMethodUsersCreateOptions
          .Properties.Integration.IntegrationResponses[0]
          .ResponseParameters['method.response.header.Access-Control-Allow-Origin']
      ).to.equal(origin);

      expect(
        awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.ApiGatewayMethodUsersCreateOptions
          .Properties.Integration.IntegrationResponses[0]
          .ResponseParameters['method.response.header.Access-Control-Allow-Headers']
      ).to.equal(headers);

      expect(
        awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.ApiGatewayMethodUsersCreateOptions
          .Properties.Integration.IntegrationResponses[0]
          .ResponseParameters['method.response.header.Access-Control-Allow-Methods']
      ).to.equal('\'OPTIONS,POST\'');

      expect(
        awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.ApiGatewayMethodUsersUpdateOptions
          .Properties.Integration.IntegrationResponses[0]
          .ResponseParameters['method.response.header.Access-Control-Allow-Origin']
      ).to.equal(origin);

      expect(
        awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.ApiGatewayMethodUsersUpdateOptions
          .Properties.Integration.IntegrationResponses[0]
          .ResponseParameters['method.response.header.Access-Control-Allow-Headers']
      ).to.equal(headers);

      expect(
        awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.ApiGatewayMethodUsersUpdateOptions
          .Properties.Integration.IntegrationResponses[0]
          .ResponseParameters['method.response.header.Access-Control-Allow-Methods']
      ).to.equal('\'OPTIONS,PUT\'');

      expect(
        awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.ApiGatewayMethodUsersDeleteOptions
          .Properties.Integration.IntegrationResponses[0]
          .ResponseParameters['method.response.header.Access-Control-Allow-Origin']
      ).to.equal(origin);

      expect(
        awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.ApiGatewayMethodUsersDeleteOptions
          .Properties.Integration.IntegrationResponses[0]
          .ResponseParameters['method.response.header.Access-Control-Allow-Headers']
      ).to.equal('\'CustomHeaderA,CustomHeaderB\'');

      expect(
        awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.ApiGatewayMethodUsersDeleteOptions
          .Properties.Integration.IntegrationResponses[0]
          .ResponseParameters['method.response.header.Access-Control-Allow-Methods']
      ).to.equal('\'OPTIONS,DELETE\'');
    });
  });

  it('should merge all preflight origins, method, and headers for a path', () => {
    awsCompileApigEvents.serverless.service.functions = {
      first: {
        events: [
          {
            http: {
              method: 'GET',
              path: 'users',
              cors: {
                origins: [
                  'http://example.com',
                ],
              },
            },
          }, {
            http: {
              method: 'POST',
              path: 'users',
              cors: {
                origins: [
                  'http://example2.com',
                ],
              },
            },
          }, {
            http: {
              method: 'PUT',
              path: 'users/{id}',
              cors: {
                headers: [
                  'TestHeader',
                ],
              },
            },
          }, {
            http: {
              method: 'DELETE',
              path: 'users/{id}',
              cors: {
                headers: [
                  'TestHeader2',
                ],
              },
            },
          },
        ],
      },
    };
    awsCompileApigEvents.resourceLogicalIds = {
      users: 'ApiGatewayResourceUsers',
      'users/{id}': 'ApiGatewayResourceUsersid',
    };
    return awsCompileApigEvents.compileMethods().then(() => {
      expect(
        awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.ApiGatewayMethodUsersidOptions
          .Properties.Integration.IntegrationResponses[0]
          .ResponseParameters['method.response.header.Access-Control-Allow-Methods']
      ).to.equal('\'OPTIONS,DELETE,PUT\'');
      expect(
        awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.ApiGatewayMethodUsersOptions
          .Properties.Integration.IntegrationResponses[0]
          .ResponseParameters['method.response.header.Access-Control-Allow-Origin']
      ).to.equal('\'http://example2.com,http://example.com\'');
      expect(
        awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.ApiGatewayMethodUsersidOptions
          .Properties.Integration.IntegrationResponses[0]
          .ResponseParameters['method.response.header.Access-Control-Allow-Headers']
      ).to.equal('\'TestHeader2,TestHeader\'');
    });
  });

  describe('when dealing with request configuration', () => {
    it('should setup a default "application/json" template', () => {
      awsCompileApigEvents.serverless.service.functions = {
        first: {
          events: [
            {
              http: {
                method: 'GET',
                path: 'users/list',
                integration: 'lambda',
              },
            },
          ],
        },
      };

      return awsCompileApigEvents.compileMethods().then(() => {
        expect(awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.ApiGatewayMethodUsersListGet.Properties
          .Integration.RequestTemplates['application/json']
        ).to.have.length.above(0);
      });
    });

    it('should setup a default "application/x-www-form-urlencoded" template', () => {
      awsCompileApigEvents.serverless.service.functions = {
        first: {
          events: [
            {
              http: {
                method: 'GET',
                path: 'users/list',
                integration: 'lambda',
              },
            },
          ],
        },
      };

      return awsCompileApigEvents.compileMethods().then(() => {
        expect(awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.ApiGatewayMethodUsersListGet.Properties
          .Integration.RequestTemplates['application/x-www-form-urlencoded']
        ).to.have.length.above(0);
      });
    });

    it('should use the default request pass-through behavior when none specified', () => {
      awsCompileApigEvents.serverless.service.functions = {
        first: {
          events: [
            {
              http: {
                method: 'GET',
                path: 'users/list',
                integration: 'lambda',
              },
            },
          ],
        },
      };

      return awsCompileApigEvents.compileMethods().then(() => {
        expect(awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.ApiGatewayMethodUsersListGet.Properties.Integration.PassthroughBehavior
        ).to.equal('NEVER');
      });
    });

    it('should use defined pass-through behavior', () => {
      awsCompileApigEvents.serverless.service.functions = {
        first: {
          events: [
            {
              http: {
                method: 'GET',
                path: 'users/list',
                integration: 'lambda',
                request: {
                  passThrough: 'WHEN_NO_TEMPLATES',
                },
              },
            },
          ],
        },
      };

      return awsCompileApigEvents.compileMethods().then(() => {
        expect(awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.ApiGatewayMethodUsersListGet.Properties.Integration.PassthroughBehavior
        ).to.equal('WHEN_NO_TEMPLATES');
      });
    });

    it('should throw an error if an invalid pass-through value is provided', () => {
      awsCompileApigEvents.serverless.service.functions = {
        first: {
          events: [
            {
              http: {
                method: 'GET',
                path: 'users/list',
                integration: 'lambda',
                request: {
                  passThrough: 'BOGUS',
                },
              },
            },
          ],
        },
      };

      expect(() => awsCompileApigEvents.compileMethods()).to.throw(Error);
    });

    it('should set custom request templates', () => {
      awsCompileApigEvents.serverless.service.functions = {
        first: {
          events: [
            {
              http: {
                method: 'GET',
                path: 'users/list',
                integration: 'lambda',
                request: {
                  template: {
                    'template/1': '{ "stage" : "$context.stage" }',
                    'template/2': '{ "httpMethod" : "$context.httpMethod" }',
                  },
                },
              },
            },
          ],
        },
      };

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
      awsCompileApigEvents.serverless.service.functions = {
        first: {
          events: [
            {
              http: {
                method: 'GET',
                path: 'users/list',
                integration: 'lambda',
                request: {
                  template: {
                    'application/json': 'overwritten-request-template-content',
                  },
                },
              },
            },
          ],
        },
      };

      return awsCompileApigEvents.compileMethods().then(() => {
        expect(awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.ApiGatewayMethodUsersListGet.Properties
          .Integration.RequestTemplates['application/json']
        ).to.equal('overwritten-request-template-content');
      });
    });

    it('should throw an error if the provided config is not an object', () => {
      awsCompileApigEvents.serverless.service.functions = {
        first: {
          events: [
            {
              http: {
                method: 'GET',
                path: 'users/list',
                integration: 'lambda',
                request: 'some string',
              },
            },
          ],
        },
      };

      expect(() => awsCompileApigEvents.compileMethods()).to.throw(Error);
    });

    it('should throw an error if the template config is not an object', () => {
      awsCompileApigEvents.serverless.service.functions = {
        first: {
          events: [
            {
              http: {
                method: 'GET',
                path: 'users/list',
                integration: 'lambda',
                request: {
                  template: 'some string',
                },
              },
            },
          ],
        },
      };

      expect(() => awsCompileApigEvents.compileMethods()).to.throw(Error);
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
                integration: 'lambda',
                response: {
                  headers: {
                    'Content-Type': "'text/plain'",
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
      awsCompileApigEvents.serverless.service.functions = {
        first: {
          events: [
            {
              http: {
                method: 'GET',
                path: 'users/list',
                integration: 'lambda',
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
            .Resources.ApiGatewayMethodUsersListGet.Properties.Integration.IntegrationResponses[0]
            .ResponseTemplates['application/json']
        ).to.equal("$input.path('$.foo')");
      });
    });

    it('should throw an error if the provided config is not an object', () => {
      awsCompileApigEvents.serverless.service.functions = {
        first: {
          events: [
            {
              http: {
                method: 'GET',
                path: 'users/list',
                integration: 'lambda',
                response: 'some string',
              },
            },
          ],
        },
      };

      expect(() => awsCompileApigEvents.compileMethods()).to.throw(Error);
    });

    it('should throw an error if the headers are not objects', () => {
      awsCompileApigEvents.serverless.service.functions = {
        first: {
          events: [
            {
              http: {
                method: 'GET',
                path: 'users/list',
                integration: 'lambda',
                response: {
                  headers: 'some string',
                },
              },
            },
          ],
        },
      };

      expect(() => awsCompileApigEvents.compileMethods()).to.throw(Error);
    });
  });

  it('should add method responses for different status codes', () => {
    awsCompileApigEvents.serverless.service.functions = {
      first: {
        events: [
          {
            http: {
              method: 'GET',
              path: 'users/list',
              integration: 'lambda',
            },
          },
        ],
      },
    };

    return awsCompileApigEvents.compileMethods().then(() => {
      expect(
        awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.ApiGatewayMethodUsersListGet.Properties.MethodResponses[1].StatusCode
      ).to.equal(400);
      expect(
        awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.ApiGatewayMethodUsersListGet.Properties.MethodResponses[2].StatusCode
      ).to.equal(401);
      expect(
        awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.ApiGatewayMethodUsersListGet.Properties.MethodResponses[3].StatusCode
      ).to.equal(403);
      expect(
        awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.ApiGatewayMethodUsersListGet.Properties.MethodResponses[4].StatusCode
      ).to.equal(404);
      expect(
        awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.ApiGatewayMethodUsersListGet.Properties.MethodResponses[5].StatusCode
      ).to.equal(422);
      expect(
        awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.ApiGatewayMethodUsersListGet.Properties.MethodResponses[6].StatusCode
      ).to.equal(500);
      expect(
        awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.ApiGatewayMethodUsersListGet.Properties.MethodResponses[7].StatusCode
      ).to.equal(502);
      expect(
        awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.ApiGatewayMethodUsersListGet.Properties.MethodResponses[8].StatusCode
      ).to.equal(504);
    });
  });

  it('should add integration responses for different status codes', () => {
    awsCompileApigEvents.serverless.service.functions = {
      first: {
        events: [
          {
            http: {
              method: 'GET',
              path: 'users/list',
              integration: 'lambda',
            },
          },
        ],
      },
    };

    return awsCompileApigEvents.compileMethods().then(() => {
      expect(
        awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.ApiGatewayMethodUsersListGet.Properties.Integration.IntegrationResponses[1]
      ).to.deep.equal({
        StatusCode: 400,
        SelectionPattern: '.*\\[400\\].*',
        ResponseParameters: {},
        ResponseTemplates: {},
      });
      expect(
        awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.ApiGatewayMethodUsersListGet.Properties.Integration.IntegrationResponses[2]
      ).to.deep.equal({
        StatusCode: 401,
        SelectionPattern: '.*\\[401\\].*',
        ResponseParameters: {},
        ResponseTemplates: {},
      });
      expect(
        awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.ApiGatewayMethodUsersListGet.Properties.Integration.IntegrationResponses[3]
      ).to.deep.equal({
        StatusCode: 403,
        SelectionPattern: '.*\\[403\\].*',
        ResponseParameters: {},
        ResponseTemplates: {},
      });
      expect(
        awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.ApiGatewayMethodUsersListGet.Properties.Integration.IntegrationResponses[4]
      ).to.deep.equal({
        StatusCode: 404,
        SelectionPattern: '.*\\[404\\].*',
        ResponseParameters: {},
        ResponseTemplates: {},
      });
      expect(
        awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.ApiGatewayMethodUsersListGet.Properties.Integration.IntegrationResponses[5]
      ).to.deep.equal({
        StatusCode: 422,
        SelectionPattern: '.*\\[422\\].*',
        ResponseParameters: {},
        ResponseTemplates: {},
      });
      expect(
        awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.ApiGatewayMethodUsersListGet.Properties.Integration.IntegrationResponses[6]
      ).to.deep.equal({
        StatusCode: 500,
        SelectionPattern: '.*(Process\\s?exited\\s?before\\s?completing\\s?request|\\[500\\]).*',
        ResponseParameters: {},
        ResponseTemplates: {},
      });
      expect(
        awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.ApiGatewayMethodUsersListGet.Properties.Integration.IntegrationResponses[7]
      ).to.deep.equal({
        StatusCode: 502,
        SelectionPattern: '.*\\[502\\].*',
        ResponseParameters: {},
        ResponseTemplates: {},
      });
      expect(
        awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.ApiGatewayMethodUsersListGet.Properties.Integration.IntegrationResponses[8]
      ).to.deep.equal({
        StatusCode: 504,
        SelectionPattern: '.*\\[504\\].*',
        ResponseParameters: {},
        ResponseTemplates: {},
      });
    });
  });

  it('should set "AWS_PROXY" as the default integration type', () =>
    awsCompileApigEvents.compileMethods().then(() => {
      expect(
        awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.ApiGatewayMethodUsersListGet.Properties.Integration.Type
      ).to.equal('AWS_PROXY');
      expect(
        awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.ApiGatewayMethodUsersCreatePost.Properties.Integration.Type
      ).to.equal('AWS_PROXY');
    })
  );

  it('should set users integration type if specified', () => {
    awsCompileApigEvents.serverless.service.functions = {
      first: {
        events: [
          {
            http: {
              method: 'GET',
              path: 'users/list',
              integration: 'lambda',
            },
          },
          {
            http: {
              path: 'users/create',
              method: 'POST',
              integration: 'LAMBDA-PROXY', // this time use uppercase syntax
            },
          },
        ],
      },
    };

    return awsCompileApigEvents.compileMethods().then(() => {
      expect(
        awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.ApiGatewayMethodUsersListGet.Properties.Integration.Type
      ).to.equal('AWS');
      expect(
        awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.ApiGatewayMethodUsersCreatePost.Properties.Integration.Type
      ).to.equal('AWS_PROXY');
    });
  });

  it('should throw an error when an invalid integration type was provided', () => {
    awsCompileApigEvents.serverless.service.functions = {
      first: {
        events: [
          {
            http: {
              method: 'GET',
              path: 'users/list',
              integration: 'INVALID',
            },
          },
        ],
      },
    };

    expect(() => awsCompileApigEvents.compileMethods()).to.throw(Error);
  });

  it('should show a warning message when using request / response config with LAMBDA-PROXY', () => {
    // initialize so we get the log method from the CLI in place
    serverless.init();

    const logStub = sinon.stub(serverless.cli, 'log');

    awsCompileApigEvents.serverless.service.functions = {
      first: {
        events: [
          {
            http: {
              method: 'get',
              path: 'users/list',
              integration: 'lambda-proxy', // can be removed as it defaults to this
              request: {
                passThrough: 'NEVER',
                template: {
                  'template/1': '{ "stage" : "$context.stage" }',
                  'template/2': '{ "httpMethod" : "$context.httpMethod" }',
                },
              },
              response: {
                template: "$input.path('$.foo')",
              },
            },
          },
        ],
      },
    };

    return awsCompileApigEvents.compileMethods().then(() => {
      expect(logStub.calledOnce).to.be.equal(true);
      expect(logStub.args[0][0].length).to.be.at.least(1);
    });
  });

  it('should add custom response codes', () => {
    awsCompileApigEvents.serverless.service.functions = {
      first: {
        events: [
          {
            http: {
              method: 'GET',
              path: 'users/list',
              integration: 'lambda',
              response: {
                template: '$input.path(\'$.foo\')',
                headers: {
                  'Content-Type': 'text/csv',
                },
                statusCodes: {
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
        ],
      },
    };

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
    awsCompileApigEvents.serverless.service.functions = {
      first: {
        events: [
          {
            http: {
              method: 'GET',
              path: 'users/list',
              integration: 'lambda',
              response: {
                template: '$input.path(\'$.foo\')',
                headers: {
                  'Content-Type': 'text/csv',
                },
                statusCodes: {
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
        ],
      },
    };

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
    awsCompileApigEvents.serverless.service.functions = {
      first: {
        events: [
          {
            http: {
              method: 'GET',
              path: 'users/list',
              integration: 'lambda',
              response: {
                template: '$input.path(\'$.foo\')',
                headers: {
                  'Content-Type': 'text/csv',
                },
                statusCodes: {
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
        ],
      },
    };

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
});
