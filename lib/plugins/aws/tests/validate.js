'use strict';

const expect = require('chai').expect;
const validate = require('../lib/validate');
const Serverless = require('../../../Serverless');

describe('#validate()', () => {
  const serverless = new Serverless();
  const awsPlugin = {};

  beforeEach(() => {
    awsPlugin.serverless = serverless;
    awsPlugin.options = {
      stage: 'dev',
      region: 'us-east-1',
    };

    awsPlugin.serverless.service.environment = {
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

    awsPlugin.serverless.config.servicePath = true;

    Object.assign(awsPlugin, validate);
  });

  it('should succeed if region exists in service', () => {
    expect(() => awsPlugin.validate()).to.not.throw(Error);
  });

  it('should throw error if region does not exist in service', () => {
    awsPlugin.options.region = 'us-west-2';
    expect(() => awsPlugin.validate()).to.throw(Error);
  });

  it('should succeed if stage exists in service', () => {
    expect(() => awsPlugin.validate()).to.not.throw(Error);
  });

  it('should throw error if stage does not exist in service', () => {
    awsPlugin.options.stage = 'prod';
    expect(() => awsPlugin.validate()).to.throw(Error);
  });

  it('should succeed if inside service (servicePath defined)', () => {
    expect(() => awsPlugin.validate()).to.not.throw(Error);
  });

  it('should throw error if not inside service (servicePath not defined)', () => {
    awsPlugin.serverless.config.servicePath = false;
    expect(() => awsPlugin.validate()).to.throw(Error);
  });
});
