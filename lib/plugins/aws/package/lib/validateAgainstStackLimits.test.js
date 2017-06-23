'use strict';

const expect = require('chai').expect;
const AwsPackage = require('../index');
const Serverless = require('../../../../Serverless');
const AwsProvider = require('../../provider/awsProvider');

describe('validateAgainstStackLimits', () => {
  let serverless;
  let awsPackage;

  beforeEach(() => {
    serverless = new Serverless();
    serverless.setProvider('aws', new AwsProvider(serverless));
    awsPackage = new AwsPackage(serverless, {});
    serverless.service = {
      service: 'my-service',
      provider: {
        compiledCloudFormationTemplate: {
          Resources: {},
          Outputs: {},
        },
      },
    };
  });

  describe('#validateAgainstStackLimits()', () => {
    it('should resolve if automatic stack splitting is used', () => {
      awsPackage.serverless.service.provider.useStackSplitting = true;

      return awsPackage.validateAgainstStackLimits();
    });

    it('should throw if resource count exceeds limit w/o using stack splitting', () => {
      let mockResources = Array(200).fill(1, 0, 200);
      mockResources = mockResources.map((res, index) => {
        const mockResource = {
          [index + 1]: {},
        };
        return mockResource;
      });

      awsPackage.serverless.service.provider
        .compiledCloudFormationTemplate.Resources = mockResources;

      return awsPackage.validateAgainstStackLimits().catch((error) => {
        expect(error).to.match(/The current Resource count limit/);
      });
    });

    it('should throw if output count exceeds limit w/o using stack splitting', () => {
      let mockOutputs = Array(60).fill(1, 0, 60);
      mockOutputs = mockOutputs.map((res, index) => {
        const mockOutput = {
          [index + 1]: {},
        };
        return mockOutput;
      });

      awsPackage.serverless.service.provider
        .compiledCloudFormationTemplate.Outputs = mockOutputs;

      return awsPackage.validateAgainstStackLimits().catch((error) => {
        expect(error).to.match(/The current Output count limit/);
      });
    });
  });
});
