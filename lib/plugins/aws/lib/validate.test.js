'use strict';

const chai = require('chai');
const AwsProvider = require('../provider/awsProvider');
const validate = require('../lib/validate');
const Serverless = require('../../../Serverless');

chai.use(require('chai-as-promised'));

const expect = chai.expect;

class MetadataService {
  request(error) {
    error('error');
  }
}

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
    provider.cachedCredentials = { accessKeyId: 'foo', secretAccessKey: 'bar' };
    awsPlugin.provider = provider;
    awsPlugin.provider.sdk = { MetadataService };
    awsPlugin.serverless = serverless;
    awsPlugin.serverless.setProvider('aws', provider);

    awsPlugin.serverless.config.servicePath = true;
    serverless.processedInput = { commands: ['deploy'] };

    Object.assign(awsPlugin, validate);
  });

  describe('#validate()', () => {
    it('should succeed if inside service (servicePath defined)', () =>
      expect(awsPlugin.validate()).to.be.fulfilled);

    it('should throw error if not inside service (servicePath not defined)', () => {
      awsPlugin.serverless.config.servicePath = false;
      return expect(awsPlugin.validate()).to.be.rejected;
    });

    // NOTE: starting here, test order is important

    it('should default to "dev" if stage is not provided', () => {
      awsPlugin.options.stage = false;
      return expect(awsPlugin.validate()).to.be.fulfilled.then(() => {
        expect(awsPlugin.provider.getStage()).to.equal('dev');
      });
    });

    it('should use the service.provider stage if present', () => {
      awsPlugin.options.stage = false;
      awsPlugin.serverless.service.provider = {
        stage: 'some-stage',
      };

      return expect(awsPlugin.validate()).to.be.fulfilled.then(() => {
        expect(awsPlugin.provider.getStage()).to.equal('some-stage');
      });
    });

    it('should default to "us-east-1" region if region is not provided', () => {
      awsPlugin.options.region = false;
      return expect(awsPlugin.validate()).to.be.fulfilled.then(() => {
        expect(awsPlugin.options.region).to.equal('us-east-1');
      });
    });

    it('should use the service.provider region if present', () => {
      awsPlugin.options.region = false;
      awsPlugin.serverless.service.provider = {
        region: 'some-region',
      };

      return expect(awsPlugin.validate()).to.be.fulfilled.then(() => {
        expect(awsPlugin.options.region).to.equal('some-region');
      });
    });

    it('should check the metadata service and throw an error if no creds and no metadata response', () => {
      awsPlugin.options.region = false;
      awsPlugin.serverless.service.provider = {
        region: 'some-region',
      };
      provider.cachedCredentials = {};

      return expect(awsPlugin.validate()).to.be.rejected.then(() => {
        expect(awsPlugin.options.region).to.equal('some-region');
      });
    });

    it('should not check the metadata service if not using a command that needs creds', () => {
      awsPlugin.options.region = false;
      awsPlugin.serverless.service.provider = {
        region: 'some-region',
      };
      provider.cachedCredentials = {};
      serverless.processedInput = { commands: ['print'] };

      return expect(awsPlugin.validate()).to.be.fulfilled.then(() => {
        expect(awsPlugin.options.region).to.equal('some-region');
      });
    });
  });
});
