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

    awsPlugin.serverless.config.servicePath = true;

    Object.assign(awsPlugin, validate);
  });

  it('should succeed if inside service (servicePath defined)', () => {
    expect(() => awsPlugin.validate()).to.not.throw(Error);
  });

  it('should throw error if not inside service (servicePath not defined)', () => {
    awsPlugin.serverless.config.servicePath = false;
    expect(() => awsPlugin.validate()).to.throw(Error);
  });

  // NOTE: starting here, test order is important

  it('should default to "dev" if stage is not provided', () => {
    awsPlugin.options.stage = false;
    return awsPlugin.validate().then(() => {
      expect(awsPlugin.options.stage).to.equal('dev');
    });
  });

  it('should use the service.defaults stage if present', () => {
    awsPlugin.options.stage = false;
    awsPlugin.serverless.service.defaults = {
      stage: 'some-stage',
    };

    return awsPlugin.validate().then(() => {
      expect(awsPlugin.options.stage).to.equal('some-stage');
    });
  });

  it('should default to "us-east-1" region if region is not provided', () => {
    awsPlugin.options.region = false;
    return awsPlugin.validate().then(() => {
      expect(awsPlugin.options.region).to.equal('us-east-1');
    });
  });

  it('should use the service.defaults region if present', () => {
    awsPlugin.options.region = false;
    awsPlugin.serverless.service.defaults = {
      region: 'some-region',
    };

    return awsPlugin.validate().then(() => {
      expect(awsPlugin.options.region).to.equal('some-region');
    });
  });
});
