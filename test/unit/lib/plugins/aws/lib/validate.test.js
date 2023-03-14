'use strict';

const chai = require('chai');
const AwsProvider = require('../../../../../../lib/plugins/aws/provider');
const validate = require('../../../../../../lib/plugins/aws/lib/validate');
const Serverless = require('../../../../../../lib/serverless');
const ServerlessError = require('../../../../../../lib/serverless-error');

chai.use(require('chai-as-promised'));

const expect = chai.expect;

describe('#validate', () => {
  // Inject options before each test, since beforeEach() is not practical in this particular scenario
  const prepare = ({ options, serviceDir = true, serviceProvider } = { serviceDir: true }) => {
    const serverless = new Serverless({ commands: [], options: {} });
    const _options = {
      stage: 'dev',
      region: 'us-east-1',
      ...options,
    };

    const provider = new AwsProvider(serverless, _options);
    provider.cachedCredentials = {
      credentials: { accessKeyId: 'foo', secretAccessKey: 'bar' },
    };

    serverless.setProvider('aws', provider);
    serverless.serviceDir = serviceDir;
    serverless.processedInput = { commands: ['deploy'] };

    if (serviceProvider) {
      serverless.service.provider = serviceProvider;
    }

    const awsPlugin = {
      options: _options,
      provider,
      serverless,
      ...validate,
    };

    return { awsPlugin, serverless };
  };

  describe('#validate()', () => {
    it('should succeed if inside service (servicePath defined)', () => {
      const { awsPlugin } = prepare();
      expect(() => awsPlugin.validate()).not.to.throw();
    });

    it('should throw error if not inside service (servicePath not defined)', () => {
      const servicePathNotDefined = { serviceDir: false };
      const { awsPlugin } = prepare(servicePathNotDefined);
      return expect(() => awsPlugin.validate()).to.throw(
        ServerlessError,
        'can only be run inside a service directory'
      );
    });

    it('should default to "dev" if stage is not provided', () => {
      const stageNotProvided = {
        options: { stage: false },
      };
      const { awsPlugin } = prepare(stageNotProvided);
      expect(() => awsPlugin.validate()).not.to.throw();
      expect(awsPlugin.options.stage).to.equal('dev');
      expect(awsPlugin.provider.getStage()).to.equal('dev');
    });

    it('should use the service.provider stage if present', () => {
      const useProviderStage = {
        options: { stage: false },
        serviceProvider: { stage: 'some-stage' },
      };
      const { awsPlugin } = prepare(useProviderStage);
      expect(() => awsPlugin.validate()).not.to.throw();
      expect(awsPlugin.options.stage).to.equal('some-stage');
      expect(awsPlugin.provider.getStage()).to.equal('some-stage');
    });

    it('should default to "us-east-1" region if region is not provided', () => {
      const regionNotProvided = {
        options: { region: false },
      };
      const { awsPlugin } = prepare(regionNotProvided);
      expect(() => awsPlugin.validate()).not.to.throw();
      expect(awsPlugin.options.region).to.equal('us-east-1');
      expect(awsPlugin.provider.getRegion()).to.equal('us-east-1');
    });

    it('should use the service.provider region if present', () => {
      const useProviderRegion = {
        options: { region: false },
        serviceProvider: { region: 'some-region' },
      };
      const { awsPlugin } = prepare(useProviderRegion);
      expect(() => awsPlugin.validate()).not.to.throw();
      expect(awsPlugin.options.region).to.equal('some-region');
      expect(awsPlugin.provider.getRegion()).to.equal('some-region');
    });
  });
});
