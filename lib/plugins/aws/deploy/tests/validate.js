'use strict';

const expect = require('chai').expect;
const AwsDeploy = require('../index');
const Serverless = require('../../../../Serverless');

describe('#validate()', () => {
  let serverless;
  let awsDeploy;

  beforeEach(() => {
    serverless = new Serverless();
    awsDeploy = new AwsDeploy(serverless);

    awsDeploy.serverless.config.servicePath = true;

    awsDeploy.serverless.service.environment = {
      vars: {},
      stages: {
        dev: {
          vars: {},
          regions: {
            'us-east-1': {
              vars: {},
            },
          },
        },
      },
    };

    awsDeploy.serverless.service.functions = {
      first: {
        handler: true,
      },
    };

    awsDeploy.options = {
      stage: 'dev',
      region: 'us-east-1',
    };
  });

  it('should throw error if stage does not exist in service', () => {
    awsDeploy.options.stage = 'prod';
    expect(() => awsDeploy.validate()).to.throw(Error);
  });

  it('should throw error if region does not exist in service', () => {
    awsDeploy.options.region = 'us-west-2';
    expect(() => awsDeploy.validate()).to.throw(Error);
  });

  it('should throw error if not inside service (servicePath not defined)', () => {
    awsDeploy.serverless.config.servicePath = false;
    expect(() => awsDeploy.validate()).to.throw(Error);
  });

  it('should throw error if region vars object does not exist', () => {
    awsDeploy.serverless.service.environment.stages.dev.regions['us-east-1'] = {};
    expect(() => awsDeploy.validate()).to.throw(Error);
  });
});

