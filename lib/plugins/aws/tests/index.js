'use strict';

const BbPromise = require('bluebird');
const expect = require('chai').expect;
const proxyquire = require('proxyquire');
const sinon = require('sinon');

const AwsSdk = require('../');
const Serverless = require('../../../Serverless');

describe('AWS SDK', () => {
  let awsSdk;
  let serverless;

  beforeEach(() => {
    const options = {
      stage: 'dev',
      region: 'us-east-1',
    };
    serverless = new Serverless(options);
    awsSdk = new AwsSdk(serverless, options);
    awsSdk.serverless.cli = new serverless.classes.CLI();
  });

  describe('#constructor()', () => {
    it('should set AWS instance', () => {
      expect(typeof awsSdk.sdk).to.not.equal('undefined');
    });

    it('should set Serverless instance', () => {
      expect(typeof awsSdk.serverless).to.not.equal('undefined');
    });

    it('should set AWS proxy', () => {
      process.env.proxy = 'http://a.b.c.d:n';
      const newAwsSdk = new AwsSdk(serverless);

      expect(typeof newAwsSdk.sdk.config.httpOptions.agent).to.not.equal('undefined');

      // clear env
      delete process.env.proxy;
    });

    it('should set AWS timeout', () => {
      process.env.AWS_CLIENT_TIMEOUT = '120000';
      const newAwsSdk = new AwsSdk(serverless);

      expect(typeof newAwsSdk.sdk.config.httpOptions.timeout).to.not.equal('undefined');

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
      awsSdk.sdk = {
        S3: FakeS3,
      };
      awsSdk.serverless.service.environment = {
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

      return awsSdk.request('S3', 'putObject', {}).then(data => {
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
      awsSdk.sdk = {
        S3: FakeS3,
      };
      awsSdk.request('S3', 'error', {})
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
      awsSdk.sdk = {
        S3: FakeS3,
      };
      awsSdk.request('S3', 'error', {})
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
      awsSdk.sdk = {
        S3: FakeS3,
      };
      awsSdk.request('S3', 'error', {})
        .then(() => done('Should not succeed'))
        .catch((err) => {
          expect(err.message).to.contain('https://git.io/viZAC');
          done();
        })
        .catch(done);
    });
  });

  describe('#getCredentials()', () => {
    const mockCreds = (configParam) => {
      const config = configParam;
      delete config.credentials;
      return config;
    };
    const awsStub = sinon.stub().returns();
    const AwsSdkProxyquired = proxyquire('../index.js', {
      'aws-sdk': awsStub,
    });

    let newAwsSdk;
    const options = {
      stage: 'teststage',
      region: 'testregion',
    };

    beforeEach(() => {
      newAwsSdk = new AwsSdkProxyquired(serverless, options);
    });

    it('should set region for credentials', () => {
      const credentials = newAwsSdk.getCredentials();
      expect(credentials.region).to.equal(options.region);
    });

    it('should get credentials from provider', () => {
      serverless.service.provider.profile = 'notDefault';
      const credentials = newAwsSdk.getCredentials();
      expect(credentials.credentials.profile).to.equal('notDefault');
    });

    it('should not set credentials if empty profile is set', () => {
      serverless.service.provider.profile = '';
      const credentials = mockCreds(newAwsSdk.getCredentials());
      expect(credentials).to.eql({ region: options.region });
    });

    it('should not set credentials if credentials is an empty object', () => {
      serverless.service.provider.credentials = {};
      const credentials = mockCreds(newAwsSdk.getCredentials());
      expect(credentials).to.eql({ region: options.region });
    });

    it('should not set credentials if credentials has undefined values', () => {
      serverless.service.provider.credentials = {
        accessKeyId: undefined,
        secretAccessKey: undefined,
        sessionToken: undefined,
      };
      const credentials = mockCreds(newAwsSdk.getCredentials());
      expect(credentials).to.eql({ region: options.region });
    });

    it('should not set credentials if credentials has empty string values', () => {
      serverless.service.provider.credentials = {
        accessKeyId: '',
        secretAccessKey: '',
        sessionToken: '',
      };
      const credentials = mockCreds(newAwsSdk.getCredentials());
      expect(credentials).to.eql({ region: options.region });
    });

    it('should get credentials from provider declared credentials', () => {
      const tmpAccessKeyID = process.env.AWS_ACCESS_KEY_ID;
      const tmpAccessKeySecret = process.env.AWS_SECRET_ACCESS_KEY;
      const tmpSessionToken = process.env.AWS_SESSION_TOKEN;

      delete process.env.AWS_ACCESS_KEY_ID;
      delete process.env.AWS_SECRET_ACCESS_KEY;
      delete process.env.AWS_SESSION_TOKEN;

      serverless.service.provider.credentials = {
        accessKeyId: 'accessKeyId',
        secretAccessKey: 'secretAccessKey',
        sessionToken: 'sessionToken',
      };
      const credentials = newAwsSdk.getCredentials();
      expect(credentials.credentials).to.deep.eql(serverless.service.provider.credentials);

      process.env.AWS_ACCESS_KEY_ID = tmpAccessKeyID;
      process.env.AWS_SECRET_ACCESS_KEY = tmpAccessKeySecret;
      process.env.AWS_SESSION_TOKEN = tmpSessionToken;
    });

    it('should get credentials from environment declared for-all-stages credentials', () => {
      const prevVal = {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
        sessionToken: process.env.AWS_SESSION_TOKEN,
      };
      const testVal = {
        accessKeyId: 'accessKeyId',
        secretAccessKey: 'secretAccessKey',
        sessionToken: 'sessionToken',
      };
      process.env.AWS_ACCESS_KEY_ID = testVal.accessKeyId;
      process.env.AWS_SECRET_ACCESS_KEY = testVal.secretAccessKey;
      process.env.AWS_SESSION_TOKEN = testVal.sessionToken;
      const credentials = newAwsSdk.getCredentials();
      process.env.AWS_ACCESS_KEY_ID = prevVal.accessKeyId;
      process.env.AWS_SECRET_ACCESS_KEY = prevVal.secretAccessKey;
      process.env.AWS_SESSION_TOKEN = prevVal.sessionToken;
      expect(credentials.credentials).to.deep.eql(testVal);
    });

    it('should get credentials from environment declared stage specific credentials', () => {
      const prevVal = {
        accessKeyId: process.env.AWS_TESTSTAGE_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_TESTSTAGE_SECRET_ACCESS_KEY,
        sessionToken: process.env.AWS_TESTSTAGE_SESSION_TOKEN,
      };
      const testVal = {
        accessKeyId: 'accessKeyId',
        secretAccessKey: 'secretAccessKey',
        sessionToken: 'sessionToken',
      };
      process.env.AWS_TESTSTAGE_ACCESS_KEY_ID = testVal.accessKeyId;
      process.env.AWS_TESTSTAGE_SECRET_ACCESS_KEY = testVal.secretAccessKey;
      process.env.AWS_TESTSTAGE_SESSION_TOKEN = testVal.sessionToken;
      const credentials = newAwsSdk.getCredentials();
      process.env.AWS_TESTSTAGE_ACCESS_KEY_ID = prevVal.accessKeyId;
      process.env.AWS_TESTSTAGE_SECRET_ACCESS_KEY = prevVal.secretAccessKey;
      process.env.AWS_TESTSTAGE_SESSION_TOKEN = prevVal.sessionToken;
      expect(credentials.credentials).to.deep.eql(testVal);
    });

    it('should not set credentials if profile is not set', () => {
      serverless.service.provider.profile = undefined;
      const credentials = mockCreds(newAwsSdk.getCredentials());
      expect(credentials).to.eql({ region: options.region });
    });

    it('should not set credentials if empty profile is set', () => {
      serverless.service.provider.profile = '';
      const credentials = mockCreds(newAwsSdk.getCredentials());
      expect(credentials).to.eql({ region: options.region });
    });

    it('should get credentials from provider declared profile', () => {
      serverless.service.provider.profile = 'notDefault';
      const credentials = newAwsSdk.getCredentials();
      expect(credentials.credentials.profile).to.equal('notDefault');
    });

    it('should get credentials from environment declared for-all-stages profile', () => {
      const prevVal = process.env.AWS_PROFILE;
      process.env.AWS_PROFILE = 'notDefault';
      const credentials = newAwsSdk.getCredentials();
      process.env.AWS_PROFILE = prevVal;
      expect(credentials.credentials.profile).to.equal('notDefault');
    });

    it('should get credentials from environment declared stage-specific profile', () => {
      const prevVal = process.env.AWS_TESTSTAGE_PROFILE;
      process.env.AWS_TESTSTAGE_PROFILE = 'notDefault';
      const credentials = newAwsSdk.getCredentials();
      process.env.AWS_TESTSTAGE_PROFILE = prevVal;
      expect(credentials.credentials.profile).to.equal('notDefault');
    });
  });

  describe('#getRegion', () => {
    it('should prefer options over config or provider', () => {
      const options = {
        region: 'optionsRegion',
      };
      const config = {
        region: 'configRegion',
      };
      serverless = new Serverless(config);
      serverless.service.provider.region = 'providerRegion';
      awsSdk = new AwsSdk(serverless, options);

      expect(awsSdk.getRegion()).to.equal(options.region);
    });
    it('should prefer config over provider in lieu of options', () => {
      const options = {};
      const config = {
        region: 'configRegion',
      };
      serverless = new Serverless(config);
      serverless.service.provider.region = 'providerRegion';
      awsSdk = new AwsSdk(serverless, options);

      expect(awsSdk.getRegion()).to.equal(config.region);
    });
    it('should use provider in lieu of options and config', () => {
      const options = {};
      const config = {};
      serverless = new Serverless(config);
      serverless.service.provider.region = 'providerRegion';
      awsSdk = new AwsSdk(serverless, options);

      expect(awsSdk.getRegion()).to.equal(serverless.service.provider.region);
    });
    it('should use the default us-east-1 in lieu of options, config, and provider', () => {
      const options = {};
      const config = {};
      serverless = new Serverless(config);
      awsSdk = new AwsSdk(serverless, options);

      expect(awsSdk.getRegion()).to.equal('us-east-1');
    });
  });

  describe('#getServerlessDeploymentBucketName', () => {
    it('should return the name of the serverless deployment bucket', () => {
      const describeStackResourcesStub = sinon
        .stub(awsSdk, 'request')
        .returns(BbPromise.resolve({
          StackResourceDetail: {
            PhysicalResourceId: 'serverlessDeploymentBucketName',
          },
        }));

      return awsSdk.getServerlessDeploymentBucketName()
        .then((bucketName) => {
          expect(describeStackResourcesStub.calledOnce).to.be.equal(true);
          expect(describeStackResourcesStub.args[0][0]).to.equal('CloudFormation');
          expect(describeStackResourcesStub.args[0][1]).to.equal('describeStackResource');
          expect(describeStackResourcesStub.args[0][2].StackName)
            .to.equal(awsSdk.naming.getStackName());

          expect(bucketName).to.equal('serverlessDeploymentBucketName');

          awsSdk.request.restore();
        });
    });

    describe('#getStage', () => {
      it('should prefer options over config or provider', () => {
        const options = {
          stage: 'optionsStage',
        };
        const config = {
          stage: 'configStage',
        };
        serverless = new Serverless(config);
        serverless.service.provider.stage = 'providerStage';
        awsSdk = new AwsSdk(serverless, options);

        expect(awsSdk.getStage()).to.equal(options.stage);
      });
      it('should prefer config over provider in lieu of options', () => {
        const options = {};
        const config = {
          stage: 'configStage',
        };
        serverless = new Serverless(config);
        serverless.service.provider.stage = 'providerStage';
        awsSdk = new AwsSdk(serverless, options);

        expect(awsSdk.getStage()).to.equal(config.stage);
      });
      it('should use provider in lieu of options and config', () => {
        const options = {};
        const config = {};
        serverless = new Serverless(config);
        serverless.service.provider.stage = 'providerStage';
        awsSdk = new AwsSdk(serverless, options);

        expect(awsSdk.getStage()).to.equal(serverless.service.provider.stage);
      });
      it('should use the default dev in lieu of options, config, and provider', () => {
        const options = {};
        const config = {};
        serverless = new Serverless(config);
        awsSdk = new AwsSdk(serverless, options);

        expect(awsSdk.getStage()).to.equal('dev');
      });
    });
  });
});
