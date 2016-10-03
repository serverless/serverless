'use strict';

const expect = require('chai').expect;
const sinon = require('sinon');
const AwsCompileApigEvents = require('../index');
const Serverless = require('../../../../../../../Serverless');

describe('#validate()', () => {
  let awsCompileApigEvents;
  let serverless;

  beforeEach(() => {
    serverless = new Serverless();
    serverless.service.provider.compiledCloudFormationTemplate = { Resources: {} };
    awsCompileApigEvents = new AwsCompileApigEvents(serverless);
    awsCompileApigEvents.options = {
      stage: 'dev',
      region: 'us-east-1',
    };
    awsCompileApigEvents.serverless.service.environment = {
      vars: {},
      stages: {
        dev: {
          vars: {},
          regions: {},
        },
      },
    };
    awsCompileApigEvents.serverless.service.environment.stages.dev.regions['us-east-1'] = {
      vars: {},
    };
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
    const http = awsCompileApigEvents.validate();
    expect(http.events).to.be.an('Array').with.length(0);
  });

  it('should reject an empty http event', () => {
    awsCompileApigEvents.serverless.service.functions = {
      first: {
        events: [
          {
            http: null,
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

    const http = awsCompileApigEvents.validate();
    expect(http.events).to.be.an('Array').with.length(2);
    expect(http.events[0]).to.have.property('path', 'foo/bar');
    expect(http.events[1]).to.have.property('path', 'foo/bar');
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

    const http = awsCompileApigEvents.validate();
    expect(http.events).to.be.an('Array').with.length(2);
    expect(http.events[0]).to.have.property('path', 'foo/bar');
    expect(http.events[1]).to.have.property('path', 'foo/bar');
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

    const http = awsCompileApigEvents.validate();
    expect(http.events).to.be.an('Array').with.length(2);
    expect(http.events[0]).to.have.property('path', 'foo/bar');
    expect(http.events[1]).to.have.property('path', 'foo/bar');
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

    const http = awsCompileApigEvents.validate();
    expect(http.events).to.be.an('Array').with.length(1);
    expect(http.events[0].cors).to.deep.equal({
      headers: ['Content-Type', 'X-Amz-Date', 'Authorization', 'X-Api-Key', 'X-Amz-Security-Token'],
      methods: ['OPTIONS', 'POST'],
      origins: ['*'],
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
              },
            },
          },
        ],
      },
    };

    const http = awsCompileApigEvents.validate();
    expect(http.events).to.be.an('Array').with.length(1);
    expect(http.events[0].cors).to.deep.equal({
      headers: ['X-Foo-Bar'],
      methods: ['POST', 'OPTIONS'],
      origins: ['acme.com'],
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

    const http = awsCompileApigEvents.validate();

    expect(http.corsPreflight['users/{id}'].methods).to.deep.equal(['OPTIONS', 'DELETE', 'PUT']);
    expect(http.corsPreflight.users.origins).to.deep.equal(['http://example2.com', 'http://example.com']);
    expect(http.corsPreflight['users/{id}'].headers).to.deep.equal(['TestHeader2', 'TestHeader']);
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

    const http = awsCompileApigEvents.validate();
    expect(http.events).to.be.an('Array').with.length(1);
    expect(http.events[0].response.statusCodes).to.deep.equal({
      200: {
        pattern: '',
      },
      404: {
        pattern: '.*"statusCode":404,.*',
        template: '$input.path(\'$.errorMessage\')',
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
                    template: '$input.path(\'$.foo\')',
                  },
                },
              },
            },
          },
        ],
      },
    };

    const http = awsCompileApigEvents.validate();
    expect(http.events).to.be.an('Array').with.length(1);
    expect(http.events[0].response.statusCodes).to.deep.equal({
      418: {
        pattern: '',
        template: '$input.path(\'$.foo\')',
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

    const http = awsCompileApigEvents.validate();
    expect(http.events).to.be.an('Array').with.length(1);
    expect(http.events[0].cors.methods).to.deep.equal(['POST', 'OPTIONS']);
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

    const http = awsCompileApigEvents.validate();
    expect(http.events).to.be.an('Array').with.length(1);
    expect(http.events[0].authorizer.name).to.equal('authorizer');
    expect(http.events[0].authorizer.arn).to.deep.equal({
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

    const http = awsCompileApigEvents.validate();
    expect(http.events).to.be.an('Array').with.length(1);
    expect(http.events[0].authorizer.name).to.equal('authorizer');
    expect(http.events[0].authorizer.arn).to.equal('xxx:dev-authorizer');
  });

  it('should handle authorizer.name object', () => {
    awsCompileApigEvents.serverless.service.functions = {
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

    const http = awsCompileApigEvents.validate();
    expect(http.events).to.be.an('Array').with.length(1);
    expect(http.events[0].authorizer.name).to.equal('authorizer');
    expect(http.events[0].authorizer.arn).to.deep.equal({
      'Fn::GetAtt': [
        'AuthorizerLambdaFunction',
        'Arn',
      ],
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

    const http = awsCompileApigEvents.validate();
    expect(http.events).to.be.an('Array').with.length(1);
    expect(http.events[0].authorizer.name).to.equal('authorizer');
    expect(http.events[0].authorizer.arn).to.equal('xxx:dev-authorizer');
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

  it('should process request parameters', () => {
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

    const http = awsCompileApigEvents.validate();
    expect(http.events).to.be.an('Array').with.length(1);
    expect(http.events[0].request.parameters).to.deep.equal({
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
    expect(() => awsCompileApigEvents.validate([
      {
        path: 'users/create',
        method: 'POST',
        authorizer: true,
      },
    ])).to.throw(Error);
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
    const http = awsCompileApigEvents.validate();
    expect(http.events).to.be.an('Array').with.length(1);
    expect(http.events[0].integration).to.equal('AWS_PROXY');
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
        ],
      },
    };

    const http = awsCompileApigEvents.validate();
    expect(http.events).to.be.an('Array').with.length(3);
    expect(http.events[0].integration).to.equal('AWS');
    expect(http.events[1].integration).to.equal('AWS');
    expect(http.events[2].integration).to.equal('AWS_PROXY');
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
    serverless.init();

    const logStub = sinon.stub(serverless.cli, 'log');

    awsCompileApigEvents.validate();

    expect(logStub.calledOnce).to.be.equal(true);
    expect(logStub.args[0][0].length).to.be.at.least(1);
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

    const http = awsCompileApigEvents.validate();
    expect(http.events).to.be.an('Array').with.length(1);
    expect(http.events[0].request.passThrough).to.equal('WHEN_NO_MATCH');
  });

  it('should default pass through to NEVER', () => {
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

    const http = awsCompileApigEvents.validate();
    expect(http.events).to.be.an('Array').with.length(1);
    expect(http.events[0].request.passThrough).to.equal('NEVER');
  });
});
