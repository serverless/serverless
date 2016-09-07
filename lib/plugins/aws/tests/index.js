'use strict';

const sinon = require('sinon');
const BbPromise = require('bluebird');
const expect = require('chai').expect;
const Serverless = require('../../../Serverless');
const AwsSdk = require('../');

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
    it('should get credentials', () => {
      const serverless = new Serverless();
      process.env.AWS_PROFILE = 'default';
      const awsSdk = new AwsSdk(serverless);
      const credentials = awsSdk.getCredentials();
      expect(credentials.profile).to.equal('default');
      delete process.env.AWS_PROFILE;
    });

    it('should get stage credentials', () => {
      const serverless = new Serverless();
      process.env.AWS_DEV_PROFILE = 'default';
      const awsSdk = new AwsSdk(serverless);
      const credentials = awsSdk.getCredentials('dev');
      expect(credentials.profile).to.deep.equal('default');
      delete process.env.AWS_DEV_PROFILE;
    });
  });

  describe('#getServerlessDeploymentBucketName', () => {
    it('should return the name of the serverless deployment bucket', () => {
      const serverless = new Serverless();
      const awsSdk = new AwsSdk(serverless);
      const options = {
        stage: 'dev',
        region: 'us-east-1',
      };

      const describeStackResourcesStub = sinon
        .stub(awsSdk, 'request')
        .returns(BbPromise.resolve({
          StackResources: [
            {
              LogicalResourceId: 'ServerlessDeploymentBucket',
              PhysicalResourceId: 'serverlessDeploymentBucketName',
            },
          ],
        }));

      return awsSdk.getServerlessDeploymentBucketName(options.stage, options.region)
        .then((bucketName) => {
          expect(describeStackResourcesStub.calledOnce).to.be.equal(true);
          expect(describeStackResourcesStub.calledWith(options.stage, options.region));
          expect(describeStackResourcesStub.args[0][0]).to.equal('CloudFormation');
          expect(describeStackResourcesStub.args[0][1]).to.equal('describeStackResources');

          expect(bucketName).to.equal('serverlessDeploymentBucketName');

          awsSdk.request.restore();
        });
    });
  });

  describe('#getStackName', () => {
    it('should return the stack name', () => {
      const serverless = new Serverless();
      serverless.service.service = 'myservice';
      const awsSdk = new AwsSdk(serverless);

      expect(awsSdk.getStackName('dev')).to.equal('myservice-dev');
    });
  });
});
