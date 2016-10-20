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
});
