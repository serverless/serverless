'use strict';

const sinon = require('sinon');
const BbPromise = require('bluebird');
const expect = require('chai').expect;
const Serverless = require('../../../Serverless');
const AwsSdk = require('../');

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

      return awsSdk.request('S3', 'putObject', {}, 'dev', 'us-east-1').then(data => {
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
      awsSdk.request('S3', 'error', {}, 'dev', 'us-east-1')
        .then(data => {
          // eslint-disable-next-line no-unused-expressions
          expect(data).to.exist;
          // eslint-disable-next-line no-unused-expressions
          expect(first).to.be.false;
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
      awsSdk.request('S3', 'error', {}, 'dev', 'us-east-1')
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
      awsSdk.request('S3', 'error', {}, 'dev', 'us-east-1')
        .then(() => done('Should not succeed'))
        .catch((err) => {
          expect(err.message).to.contain('https://git.io/viZAC');
          done();
        })
        .catch(done);
    });
  });

  describe('#getCredentials()', () => {
    it('should set region for credentials', () => {
      const credentials = awsSdk.getCredentials('teststage', 'testregion');
      expect(credentials.region).to.equal('testregion');
    });

    it('should get credentials from provider', () => {
      serverless.service.provider.profile = 'notDefault';
      const credentials = awsSdk.getCredentials();
      expect(credentials.credentials.profile).to.equal('notDefault');
    });

    it('should not set credentials if empty profile is set', () => {
      serverless.service.provider.profile = '';
      const credentials = awsSdk.getCredentials('teststage', 'testregion');
      expect(credentials).to.eql({ region: 'testregion' });
    });

    it('should not set credentials if credentials is an empty object', () => {
      serverless.service.provider.credentials = {};
      const credentials = awsSdk.getCredentials('teststage', 'testregion');
      expect(credentials).to.eql({ region: 'testregion' });
    });

    it('should not set credentials if credentials has undefined values', () => {
      serverless.service.provider.credentials = {
        accessKeyId: undefined,
        secretAccessKey: undefined,
        sessionToken: undefined,
      };
      const credentials = awsSdk.getCredentials('teststage', 'testregion');
      expect(credentials).to.eql({ region: 'testregion' });
    });

    it('should not set credentials if credentials has empty string values', () => {
      serverless.service.provider.credentials = {
        accessKeyId: '',
        secretAccessKey: '',
        sessionToken: '',
      };
      const credentials = awsSdk.getCredentials('teststage', 'testregion');
      expect(credentials).to.eql({ region: 'testregion' });
    });

    it('should get credentials from provider declared credentials', () => {
      serverless.service.provider.credentials = {
        accessKeyId: 'accessKeyId',
        secretAccessKey: 'secretAccessKey',
        sessionToken: 'sessionToken',
      };
      const credentials = awsSdk.getCredentials('teststage', 'testregion');
      expect(credentials.credentials).to.deep.eql(serverless.service.provider.credentials);
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
      const credentials = awsSdk.getCredentials('teststage', 'testregion');
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
      const credentials = awsSdk.getCredentials('teststage', 'testregion');
      process.env.AWS_TESTSTAGE_ACCESS_KEY_ID = prevVal.accessKeyId;
      process.env.AWS_TESTSTAGE_SECRET_ACCESS_KEY = prevVal.secretAccessKey;
      process.env.AWS_TESTSTAGE_SESSION_TOKEN = prevVal.sessionToken;
      expect(credentials.credentials).to.deep.eql(testVal);
    });

    it('should not set credentials if profile is not set', () => {
      serverless.service.provider.profile = undefined;
      const credentials = awsSdk.getCredentials('teststage', 'testregion');
      expect(credentials).to.eql({ region: 'testregion' });
    });

    it('should not set credentials if empty profile is set', () => {
      serverless.service.provider.profile = '';
      const credentials = awsSdk.getCredentials('teststage', 'testregion');
      expect(credentials).to.eql({ region: 'testregion' });
    });

    it('should get credentials from provider declared profile', () => {
      serverless.service.provider.profile = 'notDefault';
      const credentials = awsSdk.getCredentials();
      expect(credentials.credentials.profile).to.equal('notDefault');
    });

    it('should get credentials from environment declared for-all-stages profile', () => {
      const prevVal = process.env.AWS_PROFILE;
      process.env.AWS_PROFILE = 'notDefault';
      const credentials = awsSdk.getCredentials();
      process.env.AWS_PROFILE = prevVal;
      expect(credentials.credentials.profile).to.equal('notDefault');
    });

    it('should get credentials from environment declared stage-specific profile', () => {
      const prevVal = process.env.AWS_TESTSTAGE_PROFILE;
      process.env.AWS_TESTSTAGE_PROFILE = 'notDefault';
      const credentials = awsSdk.getCredentials('teststage', 'testregion');
      process.env.AWS_TESTSTAGE_PROFILE = prevVal;
      expect(credentials.credentials.profile).to.equal('notDefault');
    });
  });

  describe('#getServerlessDeploymentBucketName', () => {
    it('should return the name of the serverless deployment bucket', () => {
      const options = {
        stage: 'dev',
        region: 'us-east-1',
      };

      const describeStackResourcesStub = sinon
        .stub(awsSdk, 'request')
        .returns(BbPromise.resolve({
          StackResourceDetail: {
            PhysicalResourceId: 'serverlessDeploymentBucketName',
          },
        }));

      return awsSdk.getServerlessDeploymentBucketName(options.stage, options.region)
        .then((bucketName) => {
          expect(describeStackResourcesStub.calledOnce).to.be.equal(true);
          expect(describeStackResourcesStub.calledWith(options.stage, options.region));
          expect(describeStackResourcesStub.args[0][0]).to.equal('CloudFormation');
          expect(describeStackResourcesStub.args[0][1]).to.equal('describeStackResource');
          expect(describeStackResourcesStub.args[0][2].StackName)
            .to.equal(`${awsSdk.serverless.service.service}-${options.stage}`);

          expect(bucketName).to.equal('serverlessDeploymentBucketName');

          awsSdk.request.restore();
        });
    });
  });

  describe('#getStackName', () => {
    it('should return the stack name', () => {
      serverless.service.service = 'myservice';

      expect(awsSdk.getStackName('dev')).to.equal('myservice-dev');
    });
  });
});
