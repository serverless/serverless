'use strict';

const expect = require('chai').expect;
const validate = require('../lib/validate');
const Serverless = require('../../../Serverless');
const ServerlessError = require('../../../classes/Error').ServerlessError;

describe('#validate', () => {
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
        expect(awsPlugin.options.stage).to.equal('dev');
      });
    });

    it('should use the service.provider stage if present', () => {
      awsPlugin.options.stage = false;
      awsPlugin.serverless.service.provider = {
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

  describe('#validateS3BucketName()', () => {
    [
      {
        name: 'should reject an empty name',
        bucketName: '',
        expectedErrorMessage: 'cannot be undefined or empty',
      },
      {
        name: 'should reject an ip address as a name',
        bucketName: '127.0.0.1',
        expectedErrorMessage: 'cannot look like an IPv4 address',
      },
      {
        name: 'should reject names that are too long',
        bucketName: new Array(65).join('j'), // 65 items need 64 joins
        expectedErrorMessage: 'longer than 63 characters',
      },
      {
        name: 'should reject names that are too short',
        bucketName: '12',
        expectedErrorMessage: 'shorter than 3 characters',
      },
      {
        name: 'should reject names that contain invalid characters',
        bucketName: 'this has b@d characters',
        expectedErrorMessage: 'contains invalid characters',
      },
      {
        name: 'should reject names that have consecutive periods',
        bucketName: 'otherwise..valid.name',
        expectedErrorMessage: 'cannot contain consecutive periods',
      },
      {
        name: 'should reject names that start with a dash',
        bucketName: '-invalid.name',
        expectedErrorMessage: 'must start with a letter or number',
      },
      {
        name: 'should reject names that start with a period',
        bucketName: '.invalid.name',
        expectedErrorMessage: 'must start with a letter or number',
      },
      {
        name: 'should reject names that end with a dash',
        bucketName: 'invalid.name-',
        expectedErrorMessage: 'end with a letter or number',
      },
      {
        name: 'should reject names that end with a period',
        bucketName: 'invalid.name.',
        expectedErrorMessage: 'must end with a letter or number',
      },
      {
        name: 'should reject names that contain uppercase letters',
        bucketName: 'otherwise.Valid.name',
        expectedErrorMessage: 'cannot contain uppercase letters',
      },
    ].forEach(testCase => {
      it(testCase.name, () => {
        let isTestFailed = false;

        return awsPlugin.validateS3BucketName(testCase.bucketName)
          .then(() => {
            isTestFailed = true;
            expect.fail(0, 1, `Should fail with an error: ${testCase.expectedErrorMessage}`);
          })
          .catch(err => {
            // The execution got to then() - so just re-throw test failure notification
            if (isTestFailed) {
              throw err;
            }

            // Validate what error we see
            expect(err).to.be.instanceof(ServerlessError);
            expect(err.message).to.contain(testCase.expectedErrorMessage);
          });
      });
    });

    it('should accept valid names', () =>
      awsPlugin.validateS3BucketName('1.this.is.valid.2')
        .then(() => awsPlugin.validateS3BucketName('another.valid.name'))
        .then(() => awsPlugin.validateS3BucketName('1-2-3'))
        .then(() => awsPlugin.validateS3BucketName('123'))
        .then(() => awsPlugin.validateS3BucketName('should.be.allowed-to-mix'))
    );
  });
});
