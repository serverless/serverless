'use strict';

const expect = require('chai').expect;

const AwsProvider = require('../provider/awsProvider');
const validate = require('../lib/validate');
const Serverless = require('../../../Serverless');

describe('#validate', () => {
  const serverless = new Serverless();
  let provider;
  const awsPlugin = {};

  beforeEach(() => {
    awsPlugin.options = {
      stage: 'dev',
      region: 'us-east-1',
    };
    provider = new AwsProvider(serverless, awsPlugin.options);
    awsPlugin.provider = provider;
    awsPlugin.serverless = serverless;
    awsPlugin.serverless.setProvider('aws', provider);

    awsPlugin.serverless.config.servicePath = true;

    Object.assign(awsPlugin, validate);
  });

  describe('#validate()', () => {
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
        expect(awsPlugin.provider.getStage()).to.equal('dev');
      });
    });

    it('should use the service.provider stage if present', () => {
      awsPlugin.options.stage = false;
      awsPlugin.serverless.service.provider = {
        stage: 'some-stage',
      };

      return awsPlugin.validate().then(() => {
        expect(awsPlugin.provider.getStage()).to.equal('some-stage');
      });
    });

    it('should default to "us-east-1" region if region is not provided', () => {
      awsPlugin.options.region = false;
      return awsPlugin.validate().then(() => {
        expect(awsPlugin.options.region).to.equal('us-east-1');
      });
    });

    it('should use the service.provider region if present', () => {
      awsPlugin.options.region = false;
      awsPlugin.serverless.service.provider = {
        region: 'some-region',
      };

      return awsPlugin.validate().then(() => {
        expect(awsPlugin.options.region).to.equal('some-region');
      });
    });
  });
});
