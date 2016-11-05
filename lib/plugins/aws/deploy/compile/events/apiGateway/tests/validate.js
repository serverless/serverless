'use strict';

const expect = require('chai').expect;
const AwsCompileApigEvents = require('../index');
const Serverless = require('../../../../../../../Serverless');

describe('#validate()', () => {
  let awsCompileApigEvents;

  beforeEach(() => {
    const serverless = new Serverless();
    serverless.service.environment = {
      vars: {},
      stages: {
        dev: {
          vars: {},
          regions: {},
        },
      },
    };
    serverless.service.environment.stages.dev.regions['us-east-1'] = {
      vars: {},
    };
    const options = {
      stage: 'dev',
      region: 'us-east-1',
    };
    awsCompileApigEvents = new AwsCompileApigEvents(serverless, options);
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
    expect(validated.events).to.be.an('Array').with.length(2);
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
    expect(validated.events).to.be.an('Array').with.length(2);
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
    expect(validated.events).to.be.an('Array').with.length(1);
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
      'Fn::GetAtt': [
        'FooLambdaFunction',
        'Arn',
      ],
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
});
