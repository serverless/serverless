'use strict';

const BbPromise = require('bluebird');
const expect = require('chai').expect;
const proxyquire = require('proxyquire');
const sinon = require('sinon');

const AwsProvider = require('./awsProvider');
const Serverless = require('../../../Serverless');
const testUtils = require('../../../../tests/utils');

describe('AwsProvider', () => {
  let awsProvider;
  let serverless;
  const options = {
    stage: 'dev',
    region: 'us-east-1',
  };

  beforeEach(() => {
    serverless = new Serverless(options);
    awsProvider = new AwsProvider(serverless, options);
    awsProvider.serverless.cli = new serverless.classes.CLI();
  });

  describe('#getProviderName()', () => {
    it('should return the provider name', () => {
      expect(AwsProvider.getProviderName()).to.equal('aws');
    });
  });

  describe('#constructor()', () => {
    it('should set Serverless instance', () => {
      expect(typeof awsProvider.serverless).to.not.equal('undefined');
    });

    it('should set AWS instance', () => {
      expect(typeof awsProvider.sdk).to.not.equal('undefined');
    });

    it('should set the provider property', () => {
      expect(awsProvider.provider).to.equal(awsProvider);
    });

    it('should set AWS proxy', () => {
      process.env.proxy = 'http://a.b.c.d:n';
      const newAwsProvider = new AwsProvider(serverless, options);

      expect(typeof newAwsProvider.sdk.config.httpOptions.agent).to.not.equal('undefined');

      // clear env
      delete process.env.proxy;
    });

    it('should set AWS timeout', () => {
      process.env.AWS_CLIENT_TIMEOUT = '120000';
      const newAwsProvider = new AwsProvider(serverless, options);

      expect(typeof newAwsProvider.sdk.config.httpOptions.timeout).to.not.equal('undefined');

      // clear env
      delete process.env.AWS_CLIENT_TIMEOUT;
    });
  });

  describe('#request()', () => {
    it('should call correct aws method', () => {
      // mocking S3 for testing
      class FakeS3 {
        constructor(credentials) {
          this.credentials = credentials;
        }

        putObject() {
          return {
            send: (cb) => cb(null, { called: true }),
          };
        }
      }
      awsProvider.sdk = {
        S3: FakeS3,
      };
      awsProvider.serverless.service.environment = {
        vars: {},
        stages: {
          dev: {
            vars: {
              profile: 'default',
            },
            regions: {},
          },
        },
      };

      return awsProvider.request('S3', 'putObject', {}).then(data => {
        expect(data.called).to.equal(true);
      });
    });

    it('should retry if error code is 429', function (done) {
      this.timeout(10000);
      let first = true;
      const error = {
        statusCode: 429,
        message: 'Testing retry',
      };
      class FakeS3 {
        constructor(credentials) {
          this.credentials = credentials;
        }

        error() {
          return {
            send(cb) {
              if (first) {
                cb(error);
              } else {
                cb(undefined, {});
              }
              first = false;
            },
          };
        }
      }
      awsProvider.sdk = {
        S3: FakeS3,
      };
      awsProvider.request('S3', 'error', {})
        .then(data => {
          expect(data).to.exist; // eslint-disable-line no-unused-expressions
          expect(first).to.be.false; // eslint-disable-line no-unused-expressions
          done();
        })
        .catch(done);
    });

    it('should reject errors', (done) => {
      const error = {
        statusCode: 500,
        message: 'Some error message',
      };
      class FakeS3 {
        constructor(credentials) {
          this.credentials = credentials;
        }

        error() {
          return {
            send(cb) {
              cb(error);
            },
          };
        }
      }
      awsProvider.sdk = {
        S3: FakeS3,
      };
      awsProvider.request('S3', 'error', {})
        .then(() => done('Should not succeed'))
        .catch(() => done());
    });

    it('should return ref to docs for missing credentials', (done) => {
      const error = {
        statusCode: 403,
        message: 'Missing credentials in config',
      };
      class FakeS3 {
        constructor(credentials) {
          this.credentials = credentials;
        }

        error() {
          return {
            send(cb) {
              cb(error);
            },
          };
        }
      }
      awsProvider.sdk = {
        S3: FakeS3,
      };
      awsProvider.request('S3', 'error', {})
        .then(() => done('Should not succeed'))
        .catch((err) => {
          expect(err.message).to.contain('https://git.io/vXsdd');
          done();
        })
        .catch(done);
    });
  });

  describe('#getCredentials()', () => {
    const awsStub = sinon.stub().returns();
    const AwsProviderProxyquired = proxyquire('./awsProvider.js', {
      'aws-sdk': awsStub,
    });

    function replaceEnv(values) {
      const originals = {};
      for (const key of Object.keys(values)) {
        if (process.env[key]) {
          originals[key] = process.env[key];
        } else {
          originals[key] = 'undefined';
        }
        if (values[key] === 'undefined') {
          delete process.env[key];
        } else {
          process.env[key] = values[key];
        }
      }
      return originals;
    }

    // add environment variables here if you want them cleared prior to your test and restored
    // after it has completed.  Any environment variable that might alter credentials loading
    // should be added here
    const relevantEnvironment = {
      AWS_ACCESS_KEY_ID: 'undefined',
      AWS_SECRET_ACCESS_KEY: 'undefined',
      AWS_SESSION_TOKEN: 'undefined',
      AWS_TESTSTAGE_ACCESS_KEY_ID: 'undefined',
      AWS_TESTSTAGE_SECRET_ACCESS_KEY: 'undefined',
      AWS_TESTSTAGE_SESSION_TOKEN: 'undefined',
      AWS_SHARED_CREDENTIALS_FILE: testUtils.getTmpFilePath('credentials'),
      AWS_PROFILE: 'undefined',
      AWS_TESTSTAGE_PROFILE: 'undefined',
    };

    let newAwsProvider;
    const newOptions = {
      stage: 'teststage',
      region: 'testregion',
    };
    const fakeCredentials = {
      accessKeyId: 'AABBCCDDEEFF',
      secretAccessKey: '0123456789876543',
      sessionToken: '981237917391273918273918723987129837129873',
      roleArn: 'a:role:arn',
      sourceProfile: 'notDefaultTemporary',
    };

    let originalProviderCredentials;
    let originalProviderProfile;
    let originalEnvironmentVariables;
    beforeEach(() => {
      originalProviderCredentials = serverless.service.provider.credentials;
      originalProviderProfile = serverless.service.provider.profile;
      originalEnvironmentVariables = replaceEnv(relevantEnvironment);
      // make temporary credentials file
      serverless.utils.writeFileSync(
        relevantEnvironment.AWS_SHARED_CREDENTIALS_FILE,
        '[notDefault]\n' +
        `aws_access_key_id = ${fakeCredentials.accessKeyId}\n` +
        `aws_secret_access_key = ${fakeCredentials.secretAccessKey}\n` +
        '\n' +
        '[notDefaultTemporary]\n' +
        `aws_access_key_id = ${fakeCredentials.accessKeyId}\n` +
        `aws_secret_access_key = ${fakeCredentials.secretAccessKey}\n` +
        `aws_session_token = ${fakeCredentials.sessionToken}\n` +
        '\n' +
        '[notDefaultAsync]\n' +
        `role_arn = ${fakeCredentials.roleArn}\n` +
        `source_profile = ${fakeCredentials.sourceProfile}\n`
      );
      newAwsProvider = new AwsProviderProxyquired(serverless, newOptions);
    });
    afterEach(() => {
      replaceEnv(originalEnvironmentVariables);
      serverless.service.provider.profile = originalProviderProfile;
      serverless.service.provider.credentials = originalProviderCredentials;
    });

    it('should set region for credentials', () => {
      const credentials = newAwsProvider.getCredentials();
      expect(credentials.region).to.equal(newOptions.region);
    });

    it('should not set credentials if credentials is an empty object', () => {
      serverless.service.provider.credentials = {};
      const credentials = newAwsProvider.getCredentials();
      expect(credentials).to.eql({ region: newOptions.region });
    });

    it('should not set credentials if credentials has undefined values', () => {
      serverless.service.provider.credentials = {
        accessKeyId: undefined,
        secretAccessKey: undefined,
        sessionToken: undefined,
      };
      const credentials = newAwsProvider.getCredentials();
      expect(credentials).to.eql({ region: newOptions.region });
    });

    it('should not set credentials if credentials has empty string values', () => {
      serverless.service.provider.credentials = {
        accessKeyId: '',
        secretAccessKey: '',
        sessionToken: '',
      };
      const credentials = newAwsProvider.getCredentials();
      expect(credentials).to.eql({ region: newOptions.region });
    });

    it('should get credentials from provider declared credentials', () => {
      serverless.service.provider.credentials = {
        accessKeyId: 'accessKeyId',
        secretAccessKey: 'secretAccessKey',
        sessionToken: 'sessionToken',
      };
      const credentials = newAwsProvider.getCredentials();
      expect(credentials.credentials).to.deep.eql(serverless.service.provider.credentials);
    });

    it('should load profile credentials from AWS_SHARED_CREDENTIALS_FILE', () => {
      serverless.service.provider.profile = 'notDefault';
      const credentials = newAwsProvider.getCredentials();
      expect(credentials.credentials.profile).to.equal(serverless.service.provider.profile);
      expect(credentials.credentials.accessKeyId).to.equal(fakeCredentials.accessKeyId);
      expect(credentials.credentials.secretAccessKey).to.equal(fakeCredentials.secretAccessKey);
      expect(credentials.credentials.sessionToken).to.equal(undefined);
    });

    it('should load async profiles properly', () => {
      serverless.service.provider.profile = 'notDefaultAsync';
      const credentials = newAwsProvider.getCredentials();
      expect(credentials.credentials.roleArn).to.equal(fakeCredentials.roleArn);
    });

    it('should not set credentials if a non-existent profile is set', () => {
      serverless.service.provider.profile = 'not-a-defined-profile';
      const credentials = newAwsProvider.getCredentials();
      expect(credentials).to.eql({ region: newOptions.region });
    });

    it('should not set credentials if empty profile is set', () => {
      serverless.service.provider.profile = '';
      const credentials = newAwsProvider.getCredentials();
      expect(credentials).to.eql({ region: newOptions.region });
    });

    it('should not set credentials if profile is not set', () => {
      serverless.service.provider.profile = undefined;
      const credentials = newAwsProvider.getCredentials();
      expect(credentials).to.eql({ region: newOptions.region });
    });

    it('should not set credentials if empty profile is set', () => {
      serverless.service.provider.profile = '';
      const credentials = newAwsProvider.getCredentials();
      expect(credentials).to.eql({ region: newOptions.region });
    });

    it('should get credentials from provider declared temporary profile', () => {
      serverless.service.provider.profile = 'notDefaultTemporary';
      const credentials = newAwsProvider.getCredentials();
      expect(credentials.credentials.profile).to.equal(serverless.service.provider.profile);
      expect(credentials.credentials.accessKeyId).to.equal(fakeCredentials.accessKeyId);
      expect(credentials.credentials.secretAccessKey).to.equal(fakeCredentials.secretAccessKey);
      expect(credentials.credentials.sessionToken).to.equal(fakeCredentials.sessionToken);
    });

    it('should get credentials from environment declared for-all-stages credentials', () => {
      const testVal = {
        accessKeyId: 'accessKeyId',
        secretAccessKey: 'secretAccessKey',
        sessionToken: 'sessionToken',
      };
      process.env.AWS_ACCESS_KEY_ID = testVal.accessKeyId;
      process.env.AWS_SECRET_ACCESS_KEY = testVal.secretAccessKey;
      process.env.AWS_SESSION_TOKEN = testVal.sessionToken;
      const credentials = newAwsProvider.getCredentials();
      expect(credentials.credentials.accessKeyId).to.equal(testVal.accessKeyId);
      expect(credentials.credentials.secretAccessKey).to.equal(testVal.secretAccessKey);
      expect(credentials.credentials.sessionToken).to.equal(testVal.sessionToken);
    });

    it('should get credentials from environment declared stage specific credentials', () => {
      const testVal = {
        accessKeyId: 'accessKeyId',
        secretAccessKey: 'secretAccessKey',
        sessionToken: 'sessionToken',
      };
      process.env.AWS_TESTSTAGE_ACCESS_KEY_ID = testVal.accessKeyId;
      process.env.AWS_TESTSTAGE_SECRET_ACCESS_KEY = testVal.secretAccessKey;
      process.env.AWS_TESTSTAGE_SESSION_TOKEN = testVal.sessionToken;
      const credentials = newAwsProvider.getCredentials();
      expect(credentials.credentials.accessKeyId).to.equal(testVal.accessKeyId);
      expect(credentials.credentials.secretAccessKey).to.equal(testVal.secretAccessKey);
      expect(credentials.credentials.sessionToken).to.equal(testVal.sessionToken);
    });

    it('should get credentials from environment declared for-all-stages profile', () => {
      process.env.AWS_PROFILE = 'notDefault';
      const credentials = newAwsProvider.getCredentials();
      expect(credentials.credentials.profile).to.equal('notDefault');
    });

    it('should get credentials from environment declared stage-specific profile', () => {
      process.env.AWS_TESTSTAGE_PROFILE = 'notDefault';
      const credentials = newAwsProvider.getCredentials();
      expect(credentials.credentials.profile).to.equal('notDefault');
    });
  });

  describe('#getRegion()', () => {
    let newAwsProvider;

    it('should prefer options over config or provider', () => {
      const newOptions = {
        region: 'optionsRegion',
      };
      const config = {
        region: 'configRegion',
      };
      serverless = new Serverless(config);
      serverless.service.provider.region = 'providerRegion';
      newAwsProvider = new AwsProvider(serverless, newOptions);

      expect(newAwsProvider.getRegion()).to.equal(newOptions.region);
    });

    it('should prefer config over provider in lieu of options', () => {
      const newOptions = {};
      const config = {
        region: 'configRegion',
      };
      serverless = new Serverless(config);
      serverless.service.provider.region = 'providerRegion';
      newAwsProvider = new AwsProvider(serverless, newOptions);

      expect(newAwsProvider.getRegion()).to.equal(config.region);
    });

    it('should use provider in lieu of options and config', () => {
      const newOptions = {};
      const config = {};
      serverless = new Serverless(config);
      serverless.service.provider.region = 'providerRegion';
      newAwsProvider = new AwsProvider(serverless, newOptions);

      expect(newAwsProvider.getRegion()).to.equal(serverless.service.provider.region);
    });

    it('should use the default us-east-1 in lieu of options, config, and provider', () => {
      const newOptions = {};
      const config = {};
      serverless = new Serverless(config);
      newAwsProvider = new AwsProvider(serverless, newOptions);

      expect(newAwsProvider.getRegion()).to.equal('us-east-1');
    });
  });

  describe('#getServerlessDeploymentBucketName()', () => {
    it('should return the name of the serverless deployment bucket', () => {
      const describeStackResourcesStub = sinon
        .stub(awsProvider, 'request')
        .returns(BbPromise.resolve({
          StackResourceDetail: {
            PhysicalResourceId: 'serverlessDeploymentBucketName',
          },
        }));

      return awsProvider.getServerlessDeploymentBucketName()
        .then((bucketName) => {
          expect(bucketName).to.equal('serverlessDeploymentBucketName');
          expect(describeStackResourcesStub.calledOnce).to.be.equal(true);
          expect(describeStackResourcesStub.calledWithExactly(
            'CloudFormation',
            'describeStackResource',
            {
              StackName: awsProvider.naming.getStackName(),
              LogicalResourceId: awsProvider.naming.getDeploymentBucketLogicalId(),
            }
          )).to.be.equal(true);
          awsProvider.request.restore();
        });
    });

    it('should return the name of the custom deployment bucket', () => {
      awsProvider.serverless.service.provider.deploymentBucket = 'custom-bucket';

      const describeStackResourcesStub = sinon
        .stub(awsProvider, 'request')
        .returns(BbPromise.resolve({
          StackResourceDetail: {
            PhysicalResourceId: 'serverlessDeploymentBucketName',
          },
        }));

      return awsProvider.getServerlessDeploymentBucketName()
        .then((bucketName) => {
          expect(describeStackResourcesStub.called).to.be.equal(false);
          expect(bucketName).to.equal('custom-bucket');
          awsProvider.request.restore();
        });
    });

    describe('#getStage()', () => {
      it('should prefer options over config or provider', () => {
        const newOptions = {
          stage: 'optionsStage',
        };
        const config = {
          stage: 'configStage',
        };
        serverless = new Serverless(config);
        serverless.service.provider.stage = 'providerStage';
        awsProvider = new AwsProvider(serverless, newOptions);

        expect(awsProvider.getStage()).to.equal(newOptions.stage);
      });

      it('should prefer config over provider in lieu of options', () => {
        const newOptions = {};
        const config = {
          stage: 'configStage',
        };
        serverless = new Serverless(config);
        serverless.service.provider.stage = 'providerStage';
        awsProvider = new AwsProvider(serverless, newOptions);

        expect(awsProvider.getStage()).to.equal(config.stage);
      });

      it('should use provider in lieu of options and config', () => {
        const newOptions = {};
        const config = {};
        serverless = new Serverless(config);
        serverless.service.provider.stage = 'providerStage';
        awsProvider = new AwsProvider(serverless, newOptions);

        expect(awsProvider.getStage()).to.equal(serverless.service.provider.stage);
      });

      it('should use the default dev in lieu of options, config, and provider', () => {
        const newOptions = {};
        const config = {};
        serverless = new Serverless(config);
        awsProvider = new AwsProvider(serverless, newOptions);

        expect(awsProvider.getStage()).to.equal('dev');
      });
    });

    describe('#getAccountId()', () => {
      it('should return the AWS account id', () => {
        const accountId = '12345678';

        const stsGetCallerIdentityStub = sinon
          .stub(awsProvider, 'request')
          .returns(BbPromise.resolve({
            ResponseMetadata: { RequestId: '12345678-1234-1234-1234-123456789012' },
            UserId: 'ABCDEFGHIJKLMNOPQRSTU:VWXYZ',
            Account: accountId,
            Arn: 'arn:aws:sts::123456789012:assumed-role/ROLE-NAME/VWXYZ',
          }));

        return awsProvider.getAccountId()
          .then((result) => {
            expect(stsGetCallerIdentityStub.calledOnce).to.equal(true);
            expect(result).to.equal(accountId);
            awsProvider.request.restore();
          });
      });
    });
  });
});
