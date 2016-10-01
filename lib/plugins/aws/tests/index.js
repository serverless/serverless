'use strict';

const BbPromise = require('bluebird');
const expect = require('chai').expect;
const sinon = require('sinon');

const AwsSdk = require('../');
const naming = require('../lib/naming');
const Serverless = require('../../../Serverless');

describe('AWS SDK', () => {
  describe('#constructor()', () => {
    it('should set AWS instance', () => {
      const serverless = new Serverless();
      const awsSdk = new AwsSdk(serverless);

      expect(typeof awsSdk.sdk).to.not.equal('undefined');
    });

    it('should set Serverless instance', () => {
      const serverless = new Serverless();
      const awsSdk = new AwsSdk(serverless);

      expect(typeof awsSdk.serverless).to.not.equal('undefined');
    });

    it('should set AWS proxy', () => {
      const serverless = new Serverless();
      process.env.proxy = 'http://a.b.c.d:n';
      const awsSdk = new AwsSdk(serverless);

      expect(typeof awsSdk.sdk.config.httpOptions.agent).to.not.equal('undefined');

      // clear env
      delete process.env.proxy;
    });

    it('should set AWS timeout', () => {
      const serverless = new Serverless();
      process.env.AWS_CLIENT_TIMEOUT = '120000';
      const awsSdk = new AwsSdk(serverless);

      expect(typeof awsSdk.sdk.config.httpOptions.timeout).to.not.equal('undefined');

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
      const serverless = new Serverless();
      const awsSdk = new AwsSdk(serverless);
      awsSdk.sdk = {
        S3: FakeS3,
      };
      serverless.service.environment = {
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
      serverless.service.environment.stages.dev.regions['us-east-1'] = {
        vars: {},
      };
      return awsSdk.request('S3', 'putObject', {}, 'dev', 'us-east-1').then(data => {
        expect(data.called).to.equal(true);
      });
    });
  });

  describe('#getCredentials()', () => {
    it('should set region for credentials', () => {
      const serverless = new Serverless();
      const awsSdk = new AwsSdk(serverless);
      const credentials = awsSdk.getCredentials('testregion');
      expect(credentials.region).to.equal('testregion');
    });

    it('should get credentials from provider', () => {
      const serverless = new Serverless();
      const awsSdk = new AwsSdk(serverless);
      serverless.service.provider.profile = 'notDefault';
      const credentials = awsSdk.getCredentials();
      expect(credentials.credentials.profile).to.equal('notDefault');
    });

    it('should not set credentials if empty profile is set', () => {
      const serverless = new Serverless();
      const awsSdk = new AwsSdk(serverless);
      serverless.service.provider.profile = '';
      const credentials = awsSdk.getCredentials('testregion');
      expect(credentials).to.eql({ region: 'testregion' });
    });

    it('should not set credentials if profile is not set', () => {
      const serverless = new Serverless();
      const awsSdk = new AwsSdk(serverless);
      serverless.service.provider.profile = undefined;
      const credentials = awsSdk.getCredentials('testregion');
      expect(credentials).to.eql({ region: 'testregion' });
    });
  });

  describe('#getServerlessDeploymentBucketName', () => {
    it('should return the name of the serverless deployment bucket', () => {
      const options = {
        stage: 'dev',
        region: 'us-east-1',
      };
      const serverless = new Serverless(options);
      const awsSdk = new AwsSdk(serverless);

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
          expect(describeStackResourcesStub.args[0][2].StackName).to.equal(naming.getStackName());

          expect(bucketName).to.equal('serverlessDeploymentBucketName');

          awsSdk.request.restore();
        });
    });
  });
});
