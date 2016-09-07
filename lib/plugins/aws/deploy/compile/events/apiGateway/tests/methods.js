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

  it('should set authorizer config if given as string', () => {
    awsCompileApigEvents.serverless.service.functions
      .first.events[0].http.authorizer = 'authorizer';

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

  it('should set authorizer config if given as ARN string', () => {
    awsCompileApigEvents.serverless.service.functions
      .first.events[0].http.authorizer = 'xxx:dev-authorizer';

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

  it('should set authorizer config if given as object', () => {
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

  it('should set authorizer config if given as ARN object', () => {
    awsCompileApigEvents.serverless.service.functions
      .first.events[0].http.authorizer = {
        arn: 'xxx:dev-authorizer',
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

  it('should add CORS origins to method only when CORS is enabled', () => {
    const origin = '\'*\'';

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

  describe('when dealing with request configuration', () => {
    it('should setup a default "application/json" template', () =>
      awsCompileApigEvents.compileMethods().then(() => {
        expect(awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.ApiGatewayMethodUsersListGet.Properties
          .Integration.RequestTemplates['application/json']
        ).to.have.length.above(0);
      })
    );

    it('should setup a default "application/x-www-form-urlencoded" template', () =>
      awsCompileApigEvents.compileMethods().then(() => {
        expect(awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.ApiGatewayMethodUsersListGet.Properties
          .Integration.RequestTemplates['application/x-www-form-urlencoded']
        ).to.have.length.above(0);
      })
    );

    it('should use the default request pass-through behavior when none specified', () =>
       awsCompileApigEvents.compileMethods().then(() => {
         expect(awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate
           .Resources.ApiGatewayMethodUsersListGet.Properties.Integration.PassthroughBehavior
         ).to.equal('NEVER');
       })
    );

    it('should use defined pass-through behavior', () => {
      awsCompileApigEvents.serverless.service.functions = {
        first: {
          events: [
            {
              http: {
                method: 'GET',
                path: 'users/list',
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

  it('should add method responses for different status codes', () =>
    awsCompileApigEvents.compileMethods().then(() => {
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
    })
  );

  it('should add integration responses for different status codes', () =>
    awsCompileApigEvents.compileMethods().then(() => {
      expect(
        awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.ApiGatewayMethodUsersListGet.Properties.Integration.IntegrationResponses[1]
      ).to.deep.equal({ StatusCode: 400, SelectionPattern: '.*\\[400\\].*' });
      expect(
        awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.ApiGatewayMethodUsersListGet.Properties.Integration.IntegrationResponses[2]
      ).to.deep.equal({ StatusCode: 401, SelectionPattern: '.*\\[401\\].*' });
      expect(
        awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.ApiGatewayMethodUsersListGet.Properties.Integration.IntegrationResponses[3]
      ).to.deep.equal({ StatusCode: 403, SelectionPattern: '.*\\[403\\].*' });
      expect(
        awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.ApiGatewayMethodUsersListGet.Properties.Integration.IntegrationResponses[4]
      ).to.deep.equal({ StatusCode: 404, SelectionPattern: '.*\\[404\\].*' });
      expect(
        awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.ApiGatewayMethodUsersListGet.Properties.Integration.IntegrationResponses[5]
      ).to.deep.equal({ StatusCode: 422, SelectionPattern: '.*\\[422\\].*' });
      expect(
        awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.ApiGatewayMethodUsersListGet.Properties.Integration.IntegrationResponses[6]
      ).to.deep.equal({ StatusCode: 500,
        SelectionPattern: '.*(Process\\s?exited\\s?before\\s?completing\\s?request|\\[500\\]).*' });
      expect(
        awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.ApiGatewayMethodUsersListGet.Properties.Integration.IntegrationResponses[7]
      ).to.deep.equal({ StatusCode: 502, SelectionPattern: '.*\\[502\\].*' });
      expect(
        awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.ApiGatewayMethodUsersListGet.Properties.Integration.IntegrationResponses[8]
      ).to.deep.equal({ StatusCode: 504, SelectionPattern: '.*\\[504\\].*' });
    })
  );
});
