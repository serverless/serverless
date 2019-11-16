'use strict';

const expect = require('chai').expect;
const sinon = require('sinon');
const AwsCompileApigEvents = require('../index');
const Serverless = require('../../../../../../../Serverless');
const AwsProvider = require('../../../../../provider/awsProvider');

describe('#validate()', () => {
  let serverless;
  let awsCompileApigEvents;

  beforeEach(() => {
    const options = {
      stage: 'dev',
      region: 'us-east-1',
    };
    serverless = new Serverless();
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
    expect(validated.events)
      .to.be.an('Array')
      .with.length(0);
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

    expect(() => awsCompileApigEvents.validate()).to.throw(Error);
  });

  it("should throw a helpful error if http event type object doesn't have a path property", () => {
    /**
     * This can happen with surprising subtle syntax error such as when path is not
     * indented under http in yml.
     */
    awsCompileApigEvents.serverless.service.functions = {
      first: {
        events: [
          {
            http: null,
          },
        ],
      },
    };

    expect(() => awsCompileApigEvents.validate()).to.throw(
      /invalid "path" property in function "first"/
    );
  });

  it('should validate the http events "path" property', () => {
    awsCompileApigEvents.serverless.service.functions = {
      first: {
        events: [
          {
            http: {
              method: 'POST',
            },
          },
        ],
      },
    };

    expect(() => awsCompileApigEvents.validate()).to.throw(Error);
  });

  it('should validate the http events "method" property', () => {
    awsCompileApigEvents.serverless.service.functions = {
      first: {
        events: [
          {
            http: {
              path: 'foo/bar',
            },
          },
        ],
      },
    };

    expect(() => awsCompileApigEvents.validate()).to.throw(Error);
  });

  it('should validate the http events object syntax method is case insensitive', () => {
    awsCompileApigEvents.serverless.service.functions = {
      first: {
        events: [
          {
            http: {
              method: 'POST',
              path: 'foo/bar',
            },
          },
          {
            http: {
              method: 'post',
              path: 'foo/bar',
            },
          },
        ],
      },
    };

    const validated = awsCompileApigEvents.validate();
    expect(validated.events)
      .to.be.an('Array')
      .with.length(2);
  });

  it('should validate the http events string syntax method is case insensitive', () => {
    awsCompileApigEvents.serverless.service.functions = {
      first: {
        events: [
          {
            http: 'POST foo/bar',
          },
          {
            http: 'post foo/bar',
          },
        ],
      },
    };

    const validated = awsCompileApigEvents.validate();
    expect(validated.events)
      .to.be.an('Array')
      .with.length(2);
  });

  it('should throw an error if the method is invalid', () => {
    awsCompileApigEvents.serverless.service.functions = {
      first: {
        events: [
          {
            http: {
              path: 'foo/bar',
              method: 'INVALID',
            },
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
    expect(validated.events)
      .to.be.an('Array')
      .with.length(1);
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
    expect(validated.events)
      .to.be.an('Array')
      .with.length(2);
    expect(validated.events[0].http).to.have.property('path', 'foo/bar');
    expect(validated.events[1].http).to.have.property('path', 'foo/bar');
  });

  it('should throw if an authorizer is an invalid value', () => {
    awsCompileApigEvents.serverless.service.functions = {
      first: {
        events: [
          {
            http: {
              method: 'GET',
              path: 'foo/bar',
              authorizer: true,
            },
          },
        ],
      },
    };

    expect(() => awsCompileApigEvents.validate()).to.throw(Error);
  });

  it('should throw if an authorizer is an empty object', () => {
    awsCompileApigEvents.serverless.service.functions = {
      first: {
        events: [
          {
            http: {
              method: 'GET',
              path: 'foo/bar',
              authorizer: {},
            },
          },
        ],
      },
    };

    expect(() => awsCompileApigEvents.validate()).to.throw(Error);
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
    expect(validated.events)
      .to.be.an('Array')
      .with.length(2);
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
    expect(validated.events)
      .to.be.an('Array')
      .with.length(2);
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

  it('should throw an error if "origin" and "origins" CORS config is used', () => {
    awsCompileApigEvents.serverless.service.functions = {
      first: {
        events: [
          {
            http: {
              method: 'POST',
              path: '/foo/bar',
              cors: {
                origin: '*',
                origins: ['*'],
              },
            },
          },
        ],
      },
    };

    expect(() => awsCompileApigEvents.validate()).to.throw(Error, 'can only use');
  });

  it('should process cors defaults', () => {
    awsCompileApigEvents.serverless.service.functions = {
      first: {
        events: [
          {
            http: {
              method: 'POST',
              path: '/foo/bar',
              cors: true,
            },
          },
        ],
      },
    };

    const validated = awsCompileApigEvents.validate();
    expect(validated.events)
      .to.be.an('Array')
      .with.length(1);
    expect(validated.events[0].http.cors).to.deep.equal({
      headers: [
        'Content-Type',
        'X-Amz-Date',
        'Authorization',
        'X-Api-Key',
        'X-Amz-Security-Token',
        'X-Amz-User-Agent',
      ],
      methods: ['OPTIONS', 'POST'],
      origin: '*',
      origins: ['*'],
      allowCredentials: false,
    });
  });

  it('should throw if request is malformed', () => {
    awsCompileApigEvents.serverless.service.functions = {
      first: {
        events: [
          {
            http: {
              method: 'POST',
              path: '/foo/bar',
              integration: 'lambda',
              request: 'invalid',
            },
          },
        ],
      },
    };

    expect(() => awsCompileApigEvents.validate()).to.throw(Error);
  });

  it('should throw if request.passThrough is invalid', () => {
    awsCompileApigEvents.serverless.service.functions = {
      first: {
        events: [
          {
            http: {
              method: 'POST',
              path: '/foo/bar',
              integration: 'lambda',
              request: {
                passThrough: 'INVALID',
              },
            },
          },
        ],
      },
    };

    expect(() => awsCompileApigEvents.validate()).to.throw(Error);
  });

  it('should throw if request.template is malformed', () => {
    awsCompileApigEvents.serverless.service.functions = {
      first: {
        events: [
          {
            http: {
              method: 'POST',
              path: '/foo/bar',
              integration: 'lambda',
              request: {
                template: 'invalid',
              },
            },
          },
        ],
      },
    };

    expect(() => awsCompileApigEvents.validate()).to.throw(Error);
  });

  it('should throw if response is malformed', () => {
    awsCompileApigEvents.serverless.service.functions = {
      first: {
        events: [
          {
            http: {
              method: 'POST',
              path: '/foo/bar',
              integration: 'lambda',
              response: 'invalid',
            },
          },
        ],
      },
    };

    expect(() => awsCompileApigEvents.validate()).to.throw(Error);
  });

  it('should throw if response.headers are malformed', () => {
    awsCompileApigEvents.serverless.service.functions = {
      first: {
        events: [
          {
            http: {
              method: 'POST',
              path: '/foo/bar',
              integration: 'lambda',
              response: {
                headers: 'invalid',
              },
            },
          },
        ],
      },
    };

    expect(() => awsCompileApigEvents.validate()).to.throw(Error);
  });

  it('should throw if cors headers are not an array', () => {
    awsCompileApigEvents.serverless.service.functions = {
      first: {
        events: [
          {
            http: {
              method: 'POST',
              path: '/foo/bar',
              cors: {
                headers: true,
              },
            },
          },
        ],
      },
    };

    expect(() => awsCompileApigEvents.validate()).to.throw(Error);
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
    expect(validated.events)
      .to.be.an('Array')
      .with.length(1);
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

  it('should throw an error if the maxAge is not a positive integer', () => {
    awsCompileApigEvents.serverless.service.functions = {
      first: {
        events: [
          {
            http: {
              method: 'POST',
              path: '/foo/bar',
              cors: {
                origin: '*',
                maxAge: -1,
              },
            },
          },
        ],
      },
    };

    expect(() => awsCompileApigEvents.validate()).to.throw(Error);
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
    expect(validated.events)
      .to.be.an('Array')
      .with.length(1);
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
    expect(validated.events)
      .to.be.an('Array')
      .with.length(1);
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
    expect(validated.events)
      .to.be.an('Array')
      .with.length(1);
    expect(validated.events[0].http.cors.methods).to.deep.equal(['POST', 'OPTIONS']);
  });

  it('should throw an error if the method is invalid', () => {
    awsCompileApigEvents.serverless.service.functions = {
      first: {
        events: [
          {
            http: {
              path: 'foo/bar',
              method: 'INVALID',
            },
          },
        ],
      },
    };

    expect(() => awsCompileApigEvents.validate()).to.throw(Error);
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
    expect(validated.events)
      .to.be.an('Array')
      .with.length(1);
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
    expect(validated.events)
      .to.be.an('Array')
      .with.length(1);
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
    expect(validated.events)
      .to.be.an('Array')
      .with.length(1);
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
    expect(validated.events)
      .to.be.an('Array')
      .with.length(1);
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
    expect(validated.events)
      .to.be.an('Array')
      .with.length(1);
    expect(validated.events[0].http.authorizer.name).to.equal('custom-name');
    expect(validated.events[0].http.authorizer.arn).to.equal('xxx:dev-authorizer');
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

    expect(() => awsCompileApigEvents.validate()).to.throw(Error);
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

    expect(() => awsCompileApigEvents.validate()).to.throw(Error);
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
    expect(validated.events)
      .to.be.an('Array')
      .with.length(1);
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
    expect(validated.events)
      .to.be.an('Array')
      .with.length(1);
    expect(validated.events[0].http.request.parameters).to.deep.equal({
      'method.request.querystring.foo': true,
      'method.request.querystring.bar': false,
      'method.request.path.foo': true,
      'method.request.path.bar': false,
      'method.request.header.foo': true,
      'method.request.header.bar': false,
    });
  });

  it('should throw an error if the provided response config is not an object', () => {
    awsCompileApigEvents.serverless.service.functions = {
      first: {
        events: [
          {
            http: {
              path: 'foo/bar',
              method: 'GET',
              response: 'some string',
            },
          },
        ],
      },
    };

    expect(() => awsCompileApigEvents.validate()).to.throw(Error);
  });

  it('should throw an error if the response headers are not objects', () => {
    awsCompileApigEvents.serverless.service.functions = {
      first: {
        events: [
          {
            http: {
              path: 'foo/bar',
              method: 'GET',
              response: {
                headers: 'some string',
              },
            },
          },
        ],
      },
    };

    expect(() => awsCompileApigEvents.validate()).to.throw(Error);
  });

  it('throw error if authorizer property is not a string or object', () => {
    awsCompileApigEvents.serverless.service.functions = {
      first: {
        events: [
          {
            http: {
              path: 'foo/bar',
              method: 'GET',
              authorizer: 2,
            },
          },
        ],
      },
    };
    expect(() => awsCompileApigEvents.validate()).to.throw(Error);
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
    expect(validated.events)
      .to.be.an('Array')
      .with.length(1);
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
    expect(validated.events)
      .to.be.an('Array')
      .with.length(5);
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
    expect(validated.events)
      .to.be.an('Array')
      .with.length(1);
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
    expect(validated.events)
      .to.be.an('Array')
      .with.length(1);
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
    expect(validated.events)
      .to.be.an('Array')
      .with.length(1);
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
    expect(validated.events)
      .to.be.an('Array')
      .with.length(1);
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

  it('should show a warning message when using request / response config with HTTP-PROXY', () => {
    awsCompileApigEvents.serverless.service.functions = {
      first: {
        events: [
          {
            http: {
              method: 'GET',
              path: 'users/list',
              integration: 'http-proxy',
              request: {
                uri: 'http://www.example.com',
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
    // initialize so we get the log method from the CLI in place
    return serverless.init().then(() => {
      const logStub = sinon.stub(serverless.cli, 'log');

      awsCompileApigEvents.validate();

      expect(logStub.calledTwice).to.be.equal(true);
      expect(logStub.args[0][0].length).to.be.at.least(1);
    });
  });

  it('should not show a warning message when using request.parameter with HTTP-PROXY', () => {
    awsCompileApigEvents.serverless.service.functions = {
      first: {
        events: [
          {
            http: {
              method: 'GET',
              path: 'users/list',
              integration: 'http-proxy',
              request: {
                uri: 'http://www.example.com',
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

  it('should remove non-parameter or uri request/response config with HTTP-PROXY', () => {
    awsCompileApigEvents.serverless.service.functions = {
      first: {
        events: [
          {
            http: {
              method: 'GET',
              path: 'users/list',
              integration: 'http-proxy',
              request: {
                uri: 'http://www.example.com',
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
      expect(validated.events)
        .to.be.an('Array')
        .with.length(1);
      expect(validated.events[0].http.response).to.equal(undefined);
      expect(validated.events[0].http.request.uri).to.equal('http://www.example.com');
      expect(validated.events[0].http.request.parameters).to.deep.equal({
        'method.request.path.foo': true,
      });
    });
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
    expect(validated.events)
      .to.be.an('Array')
      .with.length(1);
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
    expect(validated.events)
      .to.be.an('Array')
      .with.length(1);
    expect(validated.events[0].http.integration).to.equal('AWS');
    expect(validated.events[0].http.async);
  });

  it('should show a warning message when using request / response config with LAMBDA-PROXY', () => {
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
    // initialize so we get the log method from the CLI in place
    return serverless.init().then(() => {
      const logStub = sinon.stub(serverless.cli, 'log');

      awsCompileApigEvents.validate();

      expect(logStub.calledTwice).to.be.equal(true);
      expect(logStub.args[0][0].length).to.be.at.least(1);
    });
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
      expect(validated.events)
        .to.be.an('Array')
        .with.length(1);
      expect(validated.events[0].http.response).to.equal(undefined);
      expect(validated.events[0].http.request.parameters).to.deep.equal({
        'method.request.path.foo': true,
      });
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

    expect(() => awsCompileApigEvents.validate()).to.throw(Error);
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
    expect(validated.events)
      .to.be.an('Array')
      .with.length(1);
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
    expect(validated.events)
      .to.be.an('Array')
      .with.length(1);
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
    expect(validated.events)
      .to.be.an('Array')
      .with.length(1);
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
    expect(validated.events)
      .to.be.an('Array')
      .with.length(1);
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

  it('should throw an error when connectionType is invalid', () => {
    awsCompileApigEvents.serverless.service.functions = {
      first: {
        events: [
          {
            http: {
              method: 'GET',
              path: 'users/list',
              integration: 'http-proxy',
              connectionType: 'vpc-link11',
              connectionId: 'deltabravo',
              request: {
                uri: 'http://my.uri/me',
              },
            },
          },
        ],
      },
    };

    expect(() => awsCompileApigEvents.validate()).to.throw(/Invalid APIG connectionType/);
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
    expect(validated.events)
      .to.be.an('Array')
      .with.length(1);
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
