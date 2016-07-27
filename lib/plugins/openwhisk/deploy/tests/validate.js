'use strict';

const expect = require('chai').expect;
const AwsDeploy = require('../index');
const Serverless = require('../../../../Serverless');

describe('#validate()', () => {
  let serverless;
  let openwhiskDeploy;

  beforeEach(() => {
    serverless = new Serverless();
    openwhiskDeploy = new AwsDeploy(serverless);

    openwhiskDeploy.serverless.config.servicePath = true;

    openwhiskDeploy.serverless.service.environment = {
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

    openwhiskDeploy.serverless.service.functions = {
      first: {
        handler: true,
      },
    };

    openwhiskDeploy.options = {
      stage: 'dev',
      region: 'us-east-1',
    };
  });

  it('should throw error if stage does not exist in service', () => {
    openwhiskDeploy.options.stage = 'prod';
    expect(() => openwhiskDeploy.validate()).to.throw(Error);
  });

  it('should throw error if region does not exist in service', () => {
    openwhiskDeploy.options.region = 'us-west-2';
    expect(() => openwhiskDeploy.validate()).to.throw(Error);
  });

  it('should throw error if not inside service (servicePath not defined)', () => {
    openwhiskDeploy.serverless.config.servicePath = false;
    expect(() => openwhiskDeploy.validate()).to.throw(Error);
  });

  it('should throw error if region vars object does not exist', () => {
    openwhiskDeploy.serverless.service.environment.stages.dev.regions['us-east-1'] = {};
    expect(() => openwhiskDeploy.validate()).to.throw(Error);
  });
});

