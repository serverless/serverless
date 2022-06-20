'use strict';

const chai = require('chai');
const sinon = require('sinon');
const runServerless = require('../../../../../../../../../utils/run-serverless');
const AwsCompileApigEvents = require('../../../../../../../../../../lib/plugins/aws/package/compile/events/api-gateway/index');
const Serverless = require('../../../../../../../../../../lib/serverless');
const AwsProvider = require('../../../../../../../../../../lib/plugins/aws/provider');
const ServerlessError = require('../../../../../../../../../../lib/serverless-error');

chai.use(require('chai-as-promised'));
chai.use(require('sinon-chai'));

const expect = chai.expect;

describe('#validate()', () => {
  let serverless;
  let awsCompileApigEvents;

  beforeEach(() => {
    const options = {
      stage: 'dev',
      region: 'us-east-1',
    };
    serverless = new Serverless({ commands: ['print'], options: {}, serviceDir: null });
    serverless.setProvider('aws', new AwsProvider(serverless, options));
    awsCompileApigEvents = new AwsCompileApigEvents(serverless, options);
  });

  it('should ignore non-http events', () => {
    awsCompileApigEvents.serverless.service.functions = {
      first: {
        events: [
          {
            ignored: {},
          },
        ],
      },
    };
    const validated = awsCompileApigEvents.validate();
    expect(validated.events).to.be.an('Array').with.length(0);
  });

  it('should reject an invalid http event', () => {
    awsCompileApigEvents.serverless.service.functions = {
      first: {
        events: [
          {
            http: true,
          },
        ],
      },
    };
    expect(() => awsCompileApigEvents.validate()).to.throw(Error);
  });

  it('should filter non-http events', () => {
    awsCompileApigEvents.serverless.service.functions = {
      first: {
        events: [
          {
            http: {
              method: 'GET',
              path: 'foo/bar',
            },
          },
          {},
        ],
      },
      second: {
        events: [
          {
            other: {},
          },
        ],
      },
    };

    const validated = awsCompileApigEvents.validate();
    expect(validated.events).to.be.an('Array').with.length(1);
  });

  it('should discard a starting slash from paths', () => {
    awsCompileApigEvents.serverless.service.functions = {
      first: {
        events: [
          {
            http: {
              method: 'POST',
              path: '/foo/bar',
            },
          },
          {
            http: 'GET /foo/bar',
          },
        ],
      },
    };
    const validated = awsCompileApigEvents.validate();
    expect(validated.events).to.be.an('Array').with.length(2);
    expect(validated.events[0].http).to.have.property('path', 'foo/bar');
    expect(validated.events[1].http).to.have.property('path', 'foo/bar');
  });

  it('should throw if an cognito claims are being with a lambda proxy', () => {
    awsCompileApigEvents.serverless.service.functions = {
      first: {
        events: [
          {
            http: {
              method: 'GET',
              path: 'foo/bar',
              integration: 'lambda-proxy',
              authorizer: {
                arn: 'arn:aws:cognito-idp:us-east-1:xxx:userpool/us-east-1_ZZZ',
                claims: ['email', 'nickname'],
              },
            },
          },
        ],
      },
    };

    expect(() => awsCompileApigEvents.validate()).to.throw(Error);
  });

  it('should not throw if an cognito claims are undefined with a lambda proxy', () => {
    awsCompileApigEvents.serverless.service.functions = {
      first: {
        events: [
          {
            http: {
              path: '/{proxy+}',
              method: 'ANY',
              integration: 'lambda-proxy',
              authorizer: {
                arn: 'arn:aws:cognito-idp:us-east-1:xxx:userpool/us-east-1_ZZZ',
                name: 'CognitoAuthorier',
              },
            },
          },
        ],
      },
    };

    expect(() => awsCompileApigEvents.validate()).not.to.throw(Error);
  });

  it('should not throw if an cognito claims are empty arrays with a lambda proxy', () => {
    awsCompileApigEvents.serverless.service.functions = {
      first: {
        events: [
          {
            http: {
              path: '/{proxy+}',
              method: 'ANY',
              integration: 'lambda-proxy',
              authorizer: {
                arn: 'arn:aws:cognito-idp:us-east-1:xxx:userpool/us-east-1_ZZZ',
                name: 'CognitoAuthorier',
                claims: [],
              },
            },
          },
        ],
      },
    };

    expect(() => awsCompileApigEvents.validate()).not.to.throw(Error);
  });

  it('should not throw when using a cognito string authorizer', () => {
    awsCompileApigEvents.serverless.service.functions = {
      first: {
        events: [
          {
            http: {
              path: '/{proxy+}',
              method: 'ANY',
              integration: 'lambda-proxy',
              authorizer: 'arn:aws:cognito-idp:us-east-1:$XXXXX:userpool/some-user-pool',
            },
          },
        ],
      },
    };

    expect(() => awsCompileApigEvents.validate()).not.to.throw(Error);
  });

  it('should throw when using a cognito authorizer without a name', () => {
    awsCompileApigEvents.serverless.service.functions = {
      first: {
        events: [
          {
            http: {
              path: '/{proxy+}',
              method: 'ANY',
              integration: 'lambda-proxy',
              authorizer: {
                type: 'COGNITO_USER_POOLS',
                arn: {
                  'Fn::GetAtt': ['CognitoUserPool', 'Arn'],
                },
              },
            },
          },
        ],
      },
    };

    expect(() => awsCompileApigEvents.validate()).to.throw(Error);
  });

  it('should not throw when using an object cognito authorizer with a name', () => {
    awsCompileApigEvents.serverless.service.functions = {
      first: {
        events: [
          {
            http: {
              path: '/{proxy+}',
              method: 'ANY',
              integration: 'lambda-proxy',
              authorizer: {
                type: 'COGNITO_USER_POOLS',
                name: 'MyAuthorizer',
                arn: {
                  'Fn::GetAtt': ['CognitoUserPool', 'Arn'],
                },
              },
            },
          },
        ],
      },
    };

    expect(() => awsCompileApigEvents.validate()).not.to.throw(Error);
  });

  it('should accept AWS_IAM as authorizer', () => {
    awsCompileApigEvents.serverless.service.functions = {
      foo: {},
      first: {
        events: [
          {
            http: {
              method: 'GET',
              path: 'foo/bar',
              authorizer: 'aws_iam',
            },
          },
        ],
      },
      second: {
        events: [
          {
            http: {
              method: 'GET',
              path: 'foo/bar',
              authorizer: {
                type: 'aws_iam',
              },
            },
          },
        ],
      },
    };

    const validated = awsCompileApigEvents.validate();
    expect(validated.events).to.be.an('Array').with.length(2);
    expect(validated.events[0].http.authorizer.type).to.equal('AWS_IAM');
    expect(validated.events[1].http.authorizer.type).to.equal('AWS_IAM');
  });

  it('should accept an authorizer as a string', () => {
    awsCompileApigEvents.serverless.service.functions = {
      foo: {},
      first: {
        events: [
          {
            http: {
              method: 'GET',
              path: 'foo/bar',
              authorizer: 'foo',
            },
          },
        ],
      },
      second: {
        events: [
          {
            http: {
              method: 'GET',
              path: 'foo/bar',
              authorizer: 'sss:dev-authorizer',
            },
          },
        ],
      },
    };

    const validated = awsCompileApigEvents.validate();
    expect(validated.events).to.be.an('Array').with.length(2);
    expect(validated.events[0].http.authorizer.name).to.equal('foo');
    expect(validated.events[0].http.authorizer.arn).to.deep.equal({
      'Fn::GetAtt': ['FooLambdaFunction', 'Arn'],
    });
    expect(validated.events[1].http.authorizer.name).to.equal('authorizer');
    expect(validated.events[1].http.authorizer.arn).to.equal('sss:dev-authorizer');
  });

  it('should set authorizer defaults', () => {
    awsCompileApigEvents.serverless.service.functions = {
      first: {
        events: [
          {
            http: {
              method: 'GET',
              path: 'foo/bar',
              authorizer: {
                arn: 'sss:dev-authorizer',
              },
            },
          },
        ],
      },
    };

    const validated = awsCompileApigEvents.validate();
    const authorizer = validated.events[0].http.authorizer;
    expect(authorizer.resultTtlInSeconds).to.equal(300);
    expect(authorizer.identitySource).to.equal('method.request.header.Authorization');
    expect(authorizer.managedExternally).to.equal(false);
  });

  it('should accept authorizer config', () => {
    awsCompileApigEvents.serverless.service.functions = {
      foo: {},
      first: {
        events: [
          {
            http: {
              method: 'GET',
              path: 'foo/bar',
              authorizer: {
                name: 'foo',
                resultTtlInSeconds: 500,
                identitySource: 'method.request.header.Custom',
                identityValidationExpression: 'foo',
                managedExternally: true,
              },
            },
          },
        ],
      },
    };

    const validated = awsCompileApigEvents.validate();
    const authorizer = validated.events[0].http.authorizer;
    expect(authorizer.resultTtlInSeconds).to.equal(500);
    expect(authorizer.identitySource).to.equal('method.request.header.Custom');
    expect(authorizer.identityValidationExpression).to.equal('foo');
    expect(authorizer.managedExternally).to.equal(true);
  });

  it('should accept authorizer config with a type', () => {
    awsCompileApigEvents.serverless.service.functions = {
      foo: {},
      first: {
        events: [
          {
            http: {
              method: 'GET',
              path: 'foo/bar',
              authorizer: {
                name: 'foo',
                type: 'request',
                resultTtlInSeconds: 500,
                identitySource: 'method.request.header.Custom',
                identityValidationExpression: 'foo',
              },
            },
          },
        ],
      },
    };

    const validated = awsCompileApigEvents.validate();
    const authorizer = validated.events[0].http.authorizer;
    expect(authorizer.type).to.equal('request');
  });

  it('should accept authorizer config when resultTtlInSeconds is 0', () => {
    awsCompileApigEvents.serverless.service.functions = {
      foo: {},
      first: {
        events: [
          {
            http: {
              method: 'GET',
              path: 'foo/bar',
              authorizer: {
                name: 'foo',
                resultTtlInSeconds: 0,
                identitySource: 'method.request.header.Custom',
                identityValidationExpression: 'foo',
              },
            },
          },
        ],
      },
    };

    const validated = awsCompileApigEvents.validate();
    const authorizer = validated.events[0].http.authorizer;
    expect(authorizer.resultTtlInSeconds).to.equal(0);
    expect(authorizer.identitySource).to.equal('method.request.header.Custom');
    expect(authorizer.identityValidationExpression).to.equal('foo');
  });

  it('should accept cors headers as a single string value', () => {
    awsCompileApigEvents.serverless.service.functions = {
      first: {
        events: [
          {
            http: {
              method: 'POST',
              path: '/foo/bar',
              cors: {
                headers: 'X-Foo-Bar',
              },
            },
          },
        ],
      },
    };
    const validated = awsCompileApigEvents.validate();
    expect(validated.events).to.be.an('Array').with.length(1);
    expect(validated.events[0].http.cors.headers).to.deep.equal(['X-Foo-Bar']);
  });

  it('should process cors options', () => {
    awsCompileApigEvents.serverless.service.functions = {
      first: {
        events: [
          {
            http: {
              method: 'POST',
              path: '/foo/bar',
              cors: {
                headers: ['X-Foo-Bar'],
                origins: ['acme.com'],
                methods: ['POST', 'OPTIONS'],
                maxAge: 86400,
                cacheControl: 'max-age=600, s-maxage=600, proxy-revalidate',
              },
            },
          },
        ],
      },
    };

    const validated = awsCompileApigEvents.validate();
    expect(validated.events).to.be.an('Array').with.length(1);
    expect(validated.events[0].http.cors).to.deep.equal({
      headers: ['X-Foo-Bar'],
      methods: ['POST', 'OPTIONS'],
      origins: ['acme.com'],
      allowCredentials: false,
      maxAge: 86400,
      cacheControl: 'max-age=600, s-maxage=600, proxy-revalidate',
    });
  });

  it('should merge all preflight cors options for a path', () => {
    awsCompileApigEvents.serverless.service.functions = {
      first: {
        events: [
          {
            http: {
              method: 'GET',
              path: 'users',
              cors: {
                origins: ['http://example.com'],
                allowCredentials: true,
                maxAge: 10000,
                cacheControl: 'max-age=600, s-maxage=600, proxy-revalidate',
              },
            },
          },
          {
            http: {
              method: 'POST',
              path: 'users',
              cors: {
                origins: ['http://example2.com'],
                maxAge: 86400,
              },
            },
          },
          {
            http: {
              method: 'PUT',
              path: 'users/{id}',
              cors: {
                headers: ['TestHeader'],
              },
            },
          },
          {
            http: {
              method: 'DELETE',
              path: 'users/{id}',
              cors: {
                headers: ['TestHeader2'],
              },
            },
          },
        ],
      },
    };

    const validated = awsCompileApigEvents.validate();
    expect(validated.corsPreflight['users/{id}'].methods).to.deep.equal([
      'OPTIONS',
      'DELETE',
      'PUT',
    ]);
    expect(validated.corsPreflight.users.origins).to.deep.equal([
      'http://example2.com',
      'http://example.com',
    ]);
    expect(validated.corsPreflight['users/{id}'].headers).to.deep.equal([
      'TestHeader2',
      'TestHeader',
    ]);
    expect(validated.corsPreflight.users.maxAge).to.equal(86400);
    expect(validated.corsPreflight.users.cacheControl).to.equal(
      'max-age=600, s-maxage=600, proxy-revalidate'
    );
    expect(validated.corsPreflight.users.allowCredentials).to.equal(true);
    expect(validated.corsPreflight['users/{id}'].allowCredentials).to.equal(false);
  });

  it('should add default statusCode to custom statusCodes', () => {
    awsCompileApigEvents.serverless.service.functions = {
      first: {
        events: [
          {
            http: {
              method: 'GET',
              path: 'users/list',
              integration: 'lambda',
              response: {
                statusCodes: {
                  404: {
                    pattern: '.*"statusCode":404,.*',
                    template: "$input.path('$.errorMessage')",
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

    const validated = awsCompileApigEvents.validate();
    expect(validated.events).to.be.an('Array').with.length(1);
    expect(validated.events[0].http.response.statusCodes).to.deep.equal({
      200: {
        pattern: '',
      },
      404: {
        pattern: '.*"statusCode":404,.*',
        template: "$input.path('$.errorMessage')",
        headers: {
          'Content-Type': 'text/html',
        },
      },
    });
  });

  it('should allow custom statusCode with default pattern', () => {
    awsCompileApigEvents.serverless.service.functions = {
      first: {
        events: [
          {
            http: {
              method: 'GET',
              path: 'users/list',
              integration: 'lambda',
              response: {
                statusCodes: {
                  418: {
                    pattern: '',
                    template: "$input.path('$.foo')",
                  },
                },
              },
            },
          },
        ],
      },
    };

    const validated = awsCompileApigEvents.validate();
    expect(validated.events).to.be.an('Array').with.length(1);
    expect(validated.events[0].http.response.statusCodes).to.deep.equal({
      418: {
        pattern: '',
        template: "$input.path('$.foo')",
      },
    });
  });

  it('should handle expicit methods', () => {
    awsCompileApigEvents.serverless.service.functions = {
      first: {
        events: [
          {
            http: {
              method: 'POST',
              path: '/foo/bar',
              cors: {
                methods: ['POST'],
              },
            },
          },
        ],
      },
    };

    const validated = awsCompileApigEvents.validate();
    expect(validated.events).to.be.an('Array').with.length(1);
    expect(validated.events[0].http.cors.methods).to.deep.equal(['POST', 'OPTIONS']);
  });

  it('should set authorizer.arn when provided a name string', () => {
    awsCompileApigEvents.serverless.service.functions = {
      authorizer: {},
      first: {
        events: [
          {
            http: {
              path: 'foo/bar',
              method: 'GET',
              authorizer: 'authorizer',
            },
          },
        ],
      },
    };

    const validated = awsCompileApigEvents.validate();
    expect(validated.events).to.be.an('Array').with.length(1);
    expect(validated.events[0].http.authorizer.name).to.equal('authorizer');
    expect(validated.events[0].http.authorizer.arn).to.deep.equal({
      'Fn::GetAtt': ['AuthorizerLambdaFunction', 'Arn'],
    });
  });

  it('should set authorizer.arn when provided an ARN string', () => {
    awsCompileApigEvents.serverless.service.functions = {
      first: {
        events: [
          {
            http: {
              path: 'foo/bar',
              method: 'GET',
              authorizer: 'xxx:dev-authorizer',
            },
          },
        ],
      },
    };

    const validated = awsCompileApigEvents.validate();
    expect(validated.events).to.be.an('Array').with.length(1);
    expect(validated.events[0].http.authorizer.name).to.equal('authorizer');
    expect(validated.events[0].http.authorizer.arn).to.equal('xxx:dev-authorizer');
  });

  it('should handle authorizer.name object', () => {
    awsCompileApigEvents.serverless.service.functions = {
      authorizer: {},
      first: {
        events: [
          {
            http: {
              path: 'foo/bar',
              method: 'GET',
              authorizer: {
                name: 'authorizer',
              },
            },
          },
        ],
      },
    };

    const validated = awsCompileApigEvents.validate();
    expect(validated.events).to.be.an('Array').with.length(1);
    expect(validated.events[0].http.authorizer.name).to.equal('authorizer');
    expect(validated.events[0].http.authorizer.arn).to.deep.equal({
      'Fn::GetAtt': ['AuthorizerLambdaFunction', 'Arn'],
    });
  });

  it('should handle an authorizer.arn object', () => {
    awsCompileApigEvents.serverless.service.functions = {
      first: {
        events: [
          {
            http: {
              path: 'foo/bar',
              method: 'GET',
              authorizer: {
                arn: 'xxx:dev-authorizer',
              },
            },
          },
        ],
      },
    };

    const validated = awsCompileApigEvents.validate();
    expect(validated.events).to.be.an('Array').with.length(1);
    expect(validated.events[0].http.authorizer.name).to.equal('authorizer');
    expect(validated.events[0].http.authorizer.arn).to.equal('xxx:dev-authorizer');
  });

  it('should handle an authorizer.arn with an explicit authorizer.name object', () => {
    awsCompileApigEvents.serverless.service.functions = {
      first: {
        events: [
          {
            http: {
              path: 'foo/bar',
              method: 'GET',
              authorizer: {
                arn: 'xxx:dev-authorizer',
                name: 'custom-name',
              },
            },
          },
        ],
      },
    };

    const validated = awsCompileApigEvents.validate();
    expect(validated.events).to.be.an('Array').with.length(1);
    expect(validated.events[0].http.authorizer.name).to.equal('custom-name');
    expect(validated.events[0].http.authorizer.arn).to.equal('xxx:dev-authorizer');
  });

  it('should process request parameters for lambda integration', () => {
    awsCompileApigEvents.serverless.service.functions = {
      first: {
        events: [
          {
            http: {
              integration: 'lambda',
              path: 'foo/bar',
              method: 'GET',
              request: {
                parameters: {
                  querystrings: {
                    foo: true,
                    bar: false,
                  },
                  paths: {
                    foo: true,
                    bar: false,
                  },
                  headers: {
                    foo: true,
                    bar: false,
                  },
                },
              },
            },
          },
        ],
      },
    };

    const validated = awsCompileApigEvents.validate();
    expect(validated.events).to.be.an('Array').with.length(1);
    expect(validated.events[0].http.request.parameters).to.deep.equal({
      'method.request.querystring.foo': true,
      'method.request.querystring.bar': false,
      'method.request.path.foo': true,
      'method.request.path.bar': false,
      'method.request.header.foo': true,
      'method.request.header.bar': false,
    });
  });

  it('should process request parameters for lambda-proxy integration', () => {
    awsCompileApigEvents.serverless.service.functions = {
      first: {
        events: [
          {
            http: {
              integration: 'lambda-proxy',
              path: 'foo/bar',
              method: 'GET',
              request: {
                parameters: {
                  querystrings: {
                    foo: true,
                    bar: false,
                  },
                  paths: {
                    foo: true,
                    bar: false,
                  },
                  headers: {
                    foo: true,
                    bar: false,
                  },
                },
              },
            },
          },
        ],
      },
    };

    const validated = awsCompileApigEvents.validate();
    expect(validated.events).to.be.an('Array').with.length(1);
    expect(validated.events[0].http.request.parameters).to.deep.equal({
      'method.request.querystring.foo': true,
      'method.request.querystring.bar': false,
      'method.request.path.foo': true,
      'method.request.path.bar': false,
      'method.request.header.foo': true,
      'method.request.header.bar': false,
    });
  });

  it('throw error if authorizer property is an object but no name or arn provided', () => {
    awsCompileApigEvents.serverless.service.functions = {
      first: {
        events: [
          {
            http: {
              path: 'foo/bar',
              method: 'GET',
              authorizer: {},
            },
          },
        ],
      },
    };
    expect(() => awsCompileApigEvents.validate()).to.throw(Error);
  });

  it('should set "AWS_PROXY" as the default integration type', () => {
    awsCompileApigEvents.serverless.service.functions = {
      first: {
        events: [
          {
            http: {
              method: 'GET',
              path: 'users/list',
            },
          },
        ],
      },
    };
    const validated = awsCompileApigEvents.validate();
    expect(validated.events).to.be.an('Array').with.length(1);
    expect(validated.events[0].http.integration).to.equal('AWS_PROXY');
  });

  it('should support LAMBDA integration', () => {
    awsCompileApigEvents.serverless.service.functions = {
      first: {
        events: [
          {
            http: {
              method: 'GET',
              path: 'users/list',
              integration: 'LAMBDA',
            },
          },
          {
            http: {
              method: 'PUT',
              path: 'users/list',
              integration: 'lambda',
            },
          },
          {
            http: {
              method: 'POST',
              path: 'users/list',
              integration: 'lambda-proxy',
            },
          },
          {
            http: {
              method: 'POST',
              path: 'users/list',
              integration: 'aws',
            },
          },
          {
            http: {
              method: 'POST',
              path: 'users/list',
              integration: 'AWS_PROXY',
            },
          },
        ],
      },
    };

    const validated = awsCompileApigEvents.validate();
    expect(validated.events).to.be.an('Array').with.length(5);
    expect(validated.events[0].http.integration).to.equal('AWS');
    expect(validated.events[1].http.integration).to.equal('AWS');
    expect(validated.events[2].http.integration).to.equal('AWS_PROXY');
    expect(validated.events[3].http.integration).to.equal('AWS');
    expect(validated.events[4].http.integration).to.equal('AWS_PROXY');
  });

  it('should support HTTP integration', () => {
    awsCompileApigEvents.serverless.service.functions = {
      first: {
        events: [
          {
            http: {
              method: 'GET',
              path: 'users/list',
              integration: 'HTTP',
              request: {
                uri: 'https://example.com',
              },
            },
          },
        ],
      },
    };

    const validated = awsCompileApigEvents.validate();
    expect(validated.events).to.be.an('Array').with.length(1);
    expect(validated.events[0].http.integration).to.equal('HTTP');
  });

  it('should process request parameters for HTTP integration', () => {
    awsCompileApigEvents.serverless.service.functions = {
      first: {
        events: [
          {
            http: {
              method: 'GET',
              path: 'users/list',
              integration: 'HTTP',
              request: {
                uri: 'https://example.com',
                parameters: {
                  querystrings: {
                    foo: true,
                    bar: false,
                  },
                  paths: {
                    foo: true,
                    bar: false,
                  },
                  headers: {
                    foo: true,
                    bar: false,
                  },
                },
              },
            },
          },
        ],
      },
    };

    const validated = awsCompileApigEvents.validate();
    expect(validated.events).to.be.an('Array').with.length(1);
    expect(validated.events[0].http.request.parameters).to.deep.equal({
      'method.request.querystring.foo': true,
      'method.request.querystring.bar': false,
      'method.request.path.foo': true,
      'method.request.path.bar': false,
      'method.request.header.foo': true,
      'method.request.header.bar': false,
    });
  });

  it('should throw if no uri is set in HTTP integration', () => {
    awsCompileApigEvents.serverless.service.functions = {
      first: {
        events: [
          {
            http: {
              method: 'GET',
              path: 'users/list',
              integration: 'HTTP',
            },
          },
        ],
      },
    };

    expect(() => awsCompileApigEvents.validate()).to.throw(Error);
  });

  it('should support HTTP_PROXY integration', () => {
    awsCompileApigEvents.serverless.service.functions = {
      first: {
        events: [
          {
            http: {
              method: 'GET',
              path: 'users/list',
              integration: 'HTTP_PROXY',
              request: {
                uri: 'https://example.com',
              },
            },
          },
        ],
      },
    };

    const validated = awsCompileApigEvents.validate();
    expect(validated.events).to.be.an('Array').with.length(1);
    expect(validated.events[0].http.integration).to.equal('HTTP_PROXY');
  });

  it('should process request parameters for HTTP_PROXY integration', () => {
    awsCompileApigEvents.serverless.service.functions = {
      first: {
        events: [
          {
            http: {
              method: 'GET',
              path: 'users/list',
              integration: 'HTTP_PROXY',
              request: {
                uri: 'https://example.com',
                parameters: {
                  querystrings: {
                    foo: true,
                    bar: false,
                  },
                  paths: {
                    foo: true,
                    bar: false,
                  },
                  headers: {
                    foo: true,
                    bar: false,
                  },
                },
              },
            },
          },
        ],
      },
    };

    const validated = awsCompileApigEvents.validate();
    expect(validated.events).to.be.an('Array').with.length(1);
    expect(validated.events[0].http.request.parameters).to.deep.equal({
      'method.request.querystring.foo': true,
      'method.request.querystring.bar': false,
      'method.request.path.foo': true,
      'method.request.path.bar': false,
      'method.request.header.foo': true,
      'method.request.header.bar': false,
    });
  });

  it('should throw if no uri is set in HTTP_PROXY integration', () => {
    awsCompileApigEvents.serverless.service.functions = {
      first: {
        events: [
          {
            http: {
              method: 'GET',
              path: 'users/list',
              integration: 'HTTP_PROXY',
            },
          },
        ],
      },
    };

    expect(() => awsCompileApigEvents.validate()).to.throw(Error);
  });

  it('should support MOCK integration', () => {
    awsCompileApigEvents.serverless.service.functions = {
      first: {
        events: [
          {
            http: {
              method: 'GET',
              path: 'users/list',
              integration: 'MOCK',
            },
          },
        ],
      },
    };

    const validated = awsCompileApigEvents.validate();
    expect(validated.events).to.be.an('Array').with.length(1);
    expect(validated.events[0].http.integration).to.equal('MOCK');
  });

  it('should support async AWS integration', () => {
    awsCompileApigEvents.serverless.service.functions = {
      first: {
        events: [
          {
            http: {
              method: 'GET',
              path: 'users/list',
              async: true,
            },
          },
        ],
      },
    };

    const validated = awsCompileApigEvents.validate();
    expect(validated.events).to.be.an('Array').with.length(1);
    expect(validated.events[0].http.integration).to.equal('AWS');
    expect(validated.events[0].http.async);
  });

  it('should not show a warning message when using request.parameter with LAMBDA-PROXY', () => {
    awsCompileApigEvents.serverless.service.functions = {
      first: {
        events: [
          {
            http: {
              method: 'GET',
              path: 'users/list',
              integration: 'lambda-proxy',
              request: {
                parameters: {
                  querystrings: {
                    foo: true,
                    bar: false,
                  },
                  paths: {
                    foo: true,
                    bar: false,
                  },
                  headers: {
                    foo: true,
                    bar: false,
                  },
                },
              },
            },
          },
        ],
      },
    };
    // initialize so we get the log method from the CLI in place
    return serverless.init().then(() => {
      const logStub = sinon.stub(serverless.cli, 'log');

      awsCompileApigEvents.validate();

      expect(logStub.called).to.be.equal(false);
    });
  });

  it('should remove non-parameter request/response config with LAMBDA-PROXY', () => {
    awsCompileApigEvents.serverless.service.functions = {
      first: {
        events: [
          {
            http: {
              method: 'GET',
              path: 'users/list',
              integration: 'lambda-proxy',
              request: {
                template: {
                  'template/1': '{ "stage" : "$context.stage" }',
                },
                parameters: {
                  paths: {
                    foo: true,
                  },
                },
              },
              response: {},
            },
          },
        ],
      },
    };
    // initialize so we get the log method from the CLI in place
    return serverless.init().then(() => {
      // don't want to print the logs in this test
      sinon.stub(serverless.cli, 'log');

      const validated = awsCompileApigEvents.validate();
      expect(validated.events).to.be.an('Array').with.length(1);
      expect(validated.events[0].http.response).to.equal(undefined);
      expect(validated.events[0].http.request.parameters).to.deep.equal({
        'method.request.path.foo': true,
      });
    });
  });

  it('should accept a valid passThrough', () => {
    awsCompileApigEvents.serverless.service.functions = {
      first: {
        events: [
          {
            http: {
              method: 'GET',
              path: 'users/list',
              integration: 'lambda',
              request: {
                passThrough: 'WHEN_NO_MATCH',
              },
            },
          },
        ],
      },
    };

    const validated = awsCompileApigEvents.validate();
    expect(validated.events).to.be.an('Array').with.length(1);
    expect(validated.events[0].http.request.passThrough).to.equal('WHEN_NO_MATCH');
  });

  it('should default pass through to NEVER for lambda', () => {
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

    const validated = awsCompileApigEvents.validate();
    expect(validated.events).to.be.an('Array').with.length(1);
    expect(validated.events[0].http.request.passThrough).to.equal('NEVER');
  });

  it('should not set default pass through http', () => {
    awsCompileApigEvents.serverless.service.functions = {
      first: {
        events: [
          {
            http: {
              method: 'GET',
              path: 'users/list',
              integration: 'http',
              integrationMethod: 'GET',
              request: {
                uri: 'http://my.uri/me',
              },
            },
          },
        ],
      },
    };

    const validated = awsCompileApigEvents.validate();
    expect(validated.events).to.be.an('Array').with.length(1);
    expect(validated.events[0].http.request.passThrough).to.equal(undefined);
  });

  it('should support HTTP_PROXY integration with VPC_LINK connection type', () => {
    awsCompileApigEvents.serverless.service.functions = {
      first: {
        events: [
          {
            http: {
              method: 'GET',
              path: 'users/list',
              integration: 'http-proxy',
              connectionType: 'vpc-link',
              connectionId: 'deltabravo',
              request: {
                uri: 'http://my.uri/me',
              },
            },
          },
        ],
      },
    };

    const validated = awsCompileApigEvents.validate();
    expect(validated.events).to.be.an('Array').with.length(1);
    expect(validated.events[0].http.integration).to.equal('HTTP_PROXY');
    expect(validated.events[0].http.connectionType).to.equal('VPC_LINK');
  });

  it('should throw an error when connectionId is not provided with VPC_LINK', () => {
    awsCompileApigEvents.serverless.service.functions = {
      first: {
        events: [
          {
            http: {
              method: 'GET',
              path: 'users/list',
              integration: 'http-proxy',
              connectionType: 'vpc-link',
              request: {
                uri: 'http://my.uri/me',
              },
            },
          },
        ],
      },
    };

    expect(() => awsCompileApigEvents.validate()).to.throw(/to set connectionId/);
  });

  it('should reject if http event is present and stage contains invalid chars', () => {
    const invalidOptions = {
      stage: 'my@stage',
      region: 'us-east-1',
    };
    serverless.setProvider('aws', new AwsProvider(serverless, invalidOptions));
    awsCompileApigEvents = new AwsCompileApigEvents(serverless, invalidOptions);
    awsCompileApigEvents.serverless.service.functions = {
      first: {
        events: [
          {
            http: 'GET foo/bar',
          },
        ],
      },
    };
    expect(() => awsCompileApigEvents.validate()).to.throw(
      ServerlessError,
      [
        'Invalid stage name my@stage: it should contains only [-_a-zA-Z0-9]',
        'for AWS provider if http event are present',
        'according to API Gateway limitation.',
      ].join(' ')
    );
  });

  it('should set default statusCodes to response for lambda by default', () => {
    awsCompileApigEvents.serverless.service.functions = {
      first: {
        events: [
          {
            http: {
              method: 'GET',
              path: 'users/list',
              integration: 'lambda',
              integrationMethod: 'GET',
            },
          },
        ],
      },
    };

    const validated = awsCompileApigEvents.validate();
    expect(validated.events).to.be.an('Array').with.length(1);
    expect(validated.events[0].http.response.statusCodes).to.deep.equal({
      200: {
        pattern: '',
      },
      400: {
        pattern: '[\\s\\S]*\\[400\\][\\s\\S]*',
      },
      401: {
        pattern: '[\\s\\S]*\\[401\\][\\s\\S]*',
      },
      403: {
        pattern: '[\\s\\S]*\\[403\\][\\s\\S]*',
      },
      404: {
        pattern: '[\\s\\S]*\\[404\\][\\s\\S]*',
      },
      422: {
        pattern: '[\\s\\S]*\\[422\\][\\s\\S]*',
      },
      500: {
        pattern:
          '[\\s\\S]*(Process\\s?exited\\s?before\\s?completing\\s?request|\\[500\\])[\\s\\S]*',
      },
      502: {
        pattern: '[\\s\\S]*\\[502\\][\\s\\S]*',
      },
      504: {
        pattern: '([\\s\\S]*\\[504\\][\\s\\S]*)|(.*Task timed out after \\d+\\.\\d+ seconds$)',
      },
    });
  });
});

describe('test/unit/lib/plugins/aws/package/compile/events/apiGateway/lib/validate.test.js', () => {
  let cfTemplate;
  let cfResources;
  let naming;

  const getApiGatewayMethod = (path, method) =>
    cfResources[naming.getMethodLogicalId(naming.normalizePath(path), method)];

  describe('regular', () => {
    before(async () => {
      const result = await runServerless({
        fixture: 'function',
        command: 'package',
        configExt: {
          functions: {
            authorized: {
              handler: 'index.handler',
              events: [
                {
                  http: {
                    method: 'get',
                    path: '/authorized',
                    authorizer: {
                      type: 'REQUEST',
                      name: 'basic',
                      resultTtlInSeconds: 0,
                    },
                  },
                },
              ],
            },
            corsDefault: {
              handler: 'index.handler',
              events: [
                {
                  http: {
                    method: 'POST',
                    path: '/cors-default-set-by-boolean',
                    cors: true,
                  },
                },
                {
                  http: {
                    method: 'POST',
                    path: '/cors-default-set-by-object',
                    cors: {},
                  },
                },
              ],
            },
          },
        },
      });
      cfTemplate = result.cfTemplate;
      cfResources = cfTemplate.Resources;
      naming = result.awsNaming;
    });

    it('should process cors defaults', async () => {
      const expected = {
        'method.response.header.Access-Control-Allow-Headers': `'${[
          'Content-Type',
          'X-Amz-Date',
          'Authorization',
          'X-Api-Key',
          'X-Amz-Security-Token',
          'X-Amz-User-Agent',
          'X-Amzn-Trace-Id',
        ].join(',')}'`,
        'method.response.header.Access-Control-Allow-Methods': `'${['OPTIONS', 'POST'].join(',')}'`,
        'method.response.header.Access-Control-Allow-Origin': "'*'",
      };

      expect(
        getApiGatewayMethod('/cors-default-set-by-boolean', 'OPTIONS').Properties.Integration
          .IntegrationResponses[0].ResponseParameters
      ).to.deep.eq(expected);
      expect(
        getApiGatewayMethod('/cors-default-set-by-object', 'OPTIONS').Properties.Integration
          .IntegrationResponses[0].ResponseParameters
      ).to.deep.eq(expected);
    });

    it('Should not set default `identitySource` for `request` authorizers with caching disabled', async () => {
      expect(cfResources[naming.getAuthorizerLogicalId('basic')].Properties.IdentitySource).to.be
        .undefined;
    });
  });

  it('should throw an error when restApiRootResourceId is not provided with restApiId', async () => {
    await expect(
      runServerless({
        fixture: 'function',
        command: 'package',
        configExt: {
          provider: {
            apiGateway: {
              restApiId: 'ivrcdpj7y2',
            },
          },
          functions: {
            first: {
              handler: 'index.handler',
              events: [
                {
                  http: {
                    method: 'GET',
                    path: 'foo/bar',
                  },
                },
              ],
            },
          },
        },
      })
    ).to.be.eventually.rejected.and.have.property(
      'code',
      'API_GATEWAY_MISSING_REST_API_ROOT_RESOURCE_ID'
    );
  });
  it('should throw when using a CUSTOM authorizer without an authorizer id', async () => {
    await expect(
      runServerless({
        fixture: 'function',
        command: 'package',
        configExt: {
          functions: {
            first: {
              handler: 'index.handler',
              events: [
                {
                  http: {
                    method: 'POST',
                    path: '/custom-authorizer',
                    integration: 'lambda-proxy',
                    authorizer: {
                      type: 'CUSTOM',
                    },
                  },
                },
              ],
            },
          },
        },
      })
    ).to.be.eventually.rejected.and.have.property(
      'code',
      'API_GATEWAY_MISSING_AUTHORIZER_NAME_OR_ARN'
    );
  });

  it('should not throw when using CUSTOM authorizer with an authorizer id', async () => {
    const result = await runServerless({
      fixture: 'function',
      command: 'package',
      configExt: {
        functions: {
          first: {
            handler: 'index.handler',
            events: [
              {
                http: {
                  method: 'POST',
                  path: '/custom-authorizer',
                  integration: 'lambda-proxy',
                  authorizer: {
                    type: 'CUSTOM',
                    authorizerId: 'MyAuthorizerId',
                  },
                },
              },
            ],
          },
        },
      },
    });

    cfResources = result.cfTemplate.Resources;
    naming = result.awsNaming;
    const resource = getApiGatewayMethod('/custom-authorizer', 'POST');
    expect(resource.Properties.AuthorizationType).to.equal('CUSTOM');
  });

  it('Should error when using external API Gateway and enabling tracing', async () => {
    await expect(
      runServerless({
        fixture: 'api-gateway',
        command: 'package',
        configExt: {
          provider: {
            apiGateway: {
              restApiId: 'xxx',
              restApiRootResourceId: 'yyy',
            },
            tracing: {
              apiGateway: true,
            },
          },
        },
      })
    ).to.be.eventually.rejected.and.have.property('code', 'API_GATEWAY_EXTERNAL_API_TRACING');
  });

  it('Should error when using external API Gateway and enabling logs', async () => {
    await expect(
      runServerless({
        fixture: 'api-gateway',
        command: 'package',
        configExt: {
          provider: {
            apiGateway: {
              restApiId: 'xxx',
              restApiRootResourceId: 'yyy',
            },
            logs: {
              restApi: true,
            },
          },
        },
      })
    ).to.be.eventually.rejected.and.have.property('code', 'API_GATEWAY_EXTERNAL_API_LOGS');
  });
});
