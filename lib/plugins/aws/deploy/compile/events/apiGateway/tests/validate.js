'use strict';

const expect = require('chai').expect;
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

  it('should throw an error if the compiled CloudFormation template is not available', () => {
    awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate = false;

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

    expect(() => awsCompileApigEvents.validate()).to.not.throw(Error);
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

    expect(() => awsCompileApigEvents.validate()).to.not.throw(Error);
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
