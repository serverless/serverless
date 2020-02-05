'use strict';

const sinon = require('sinon');
const chai = require('chai');
const { generateRandomString } = require('../../../../../tests/utils/misc');
const runServerless = require('../../../../../tests/utils/run-serverless');
const fixtures = require('../../../../../tests/fixtures');

const expect = chai.expect;

let bucketName;
const runServelessOptions = {
  cliArgs: ['deploy'],
  // Mimic existence of AWS cres
  env: { AWS_CONTAINER_CREDENTIALS_FULL_URI: 'ignore' },
  lastLifecycleHookName: 'aws:deploy:deploy:uploadArtifacts',
  shouldStubSpawn: true,
  awsRequestStubMap: {
    CloudFormation: {
      describeStacks: { Stacks: [] },
      describeStackResource: {
        StackResourceDetail: {
          /* PhysicalResourceId filled in beforeEach */
        },
      },
    },
    S3: {
      listObjectsV2: {},
      upload: {},
    },
    STS: {
      getCallerIdentity: {
        ResponseMetadata: { RequestId: 'ffffffff-ffff-ffff-ffff-ffffffffffff' },
        UserId: 'XXXXXXXXXXXXXXXXXXXXX',
        Account: '999999999999',
        Arn: 'arn:aws:iam::999999999999:user/test',
      },
    },
  },
};

describe('uploadArtifacts', () => {
  beforeEach(() => {
    bucketName = `deployment-bucket-${generateRandomString(4)}`;
    runServelessOptions.awsRequestStubMap.CloudFormation.describeStackResource.StackResourceDetail.PhysicalResourceId = bucketName;
  });

  afterEach(() => {
    sinon.resetHistory();
    return fixtures.cleanup();
  });

  describe('#uploadCloudFormationFile()', () => {
    it('should upload the CloudFormation file to the S3 bucket', () =>
      runServerless(
        Object.assign({ config: { service: 'irrelevant', provider: 'aws' } }, runServelessOptions)
      ).then(serverless => {
        const uploadRequest = serverless
          .getProvider('aws')
          .request.args.find(
            ([service, method, body]) =>
              service === 'S3' &&
              method === 'upload' &&
              body.Key.endsWith('compiled-cloudformation-template.json')
          );
        expect(uploadRequest).to.be.an('array');
        const requestBody = uploadRequest[2];
        expect(requestBody.Bucket).to.equal(bucketName);
      }));

    it('should upload the CloudFormation file to a bucket with SSE bucket policy', () =>
      runServerless(
        Object.assign(
          {
            config: {
              service: 'irrelevant',
              provider: {
                name: 'aws',
                deploymentBucket: { serverSideEncryption: 'AES256' },
              },
            },
          },
          runServelessOptions
        )
      ).then(serverless => {
        const uploadRequest = serverless
          .getProvider('aws')
          .request.args.find(
            ([service, method, body]) =>
              service === 'S3' &&
              method === 'upload' &&
              body.Key.endsWith('compiled-cloudformation-template.json')
          );
        expect(uploadRequest).to.be.an('array');
        const requestBody = uploadRequest[2];
        expect(requestBody.Bucket).to.equal(bucketName);
        expect(requestBody.ServerSideEncryption).to.equal('AES256');
      }));
  });

  describe('#uploadFunctionsAndLayers()', () => {
    it('should upload the service .zip file to the S3 bucket', () =>
      runServerless(Object.assign({ cwd: fixtures.map.regular }, runServelessOptions)).then(
        serverless => {
          const uploadRequest = serverless
            .getProvider('aws')
            .request.args.find(
              ([service, method, body]) =>
                service === 'S3' && method === 'upload' && body.Key.endsWith('service.zip')
            );
          expect(uploadRequest).to.be.an('array');
          const requestBody = uploadRequest[2];
          expect(requestBody.Bucket).to.equal(bucketName);
        }
      ));

    it('should upload the service .zip file to a bucket with SSE bucket policy', () =>
      runServerless(
        Object.assign({ cwd: fixtures.map.bucketEncryption }, runServelessOptions)
      ).then(serverless => {
        const uploadRequest = serverless
          .getProvider('aws')
          .request.args.find(
            ([service, method, body]) =>
              service === 'S3' && method === 'upload' && body.Key.endsWith('service.zip')
          );
        expect(uploadRequest).to.be.an('array');
        const requestBody = uploadRequest[2];
        expect(requestBody.Bucket).to.equal(bucketName);
        expect(requestBody.ServerSideEncryption).to.equal('AES256');
      }));

    it('should upload a single .zip file to the S3 bucket when not packaging individually', () =>
      runServerless(
        Object.assign({ cwd: fixtures.map.packagedIndividually }, runServelessOptions)
      ).then(serverless => {
        const uploadRequest = serverless
          .getProvider('aws')
          .request.args.find(
            ([service, method, body]) =>
              service === 'S3' && method === 'upload' && body.Key.endsWith('foo.zip')
          );
        expect(uploadRequest).to.be.an('array');
        const requestBody = uploadRequest[2];
        expect(requestBody.Bucket).to.equal(bucketName);
      }));

    it('should upload the function artifact to the S3 bucket', () =>
      runServerless(
        Object.assign({ cwd: fixtures.map.customFunctionArtifact }, runServelessOptions)
      ).then(serverless => {
        const uploadRequest = serverless
          .getProvider('aws')
          .request.args.find(
            ([service, method, body]) =>
              service === 'S3' &&
              method === 'upload' &&
              body.Key.endsWith('custom-foo-artifact.zip')
          );
        expect(uploadRequest).to.be.an('array');
        const requestBody = uploadRequest[2];
        expect(requestBody.Bucket).to.equal(bucketName);
      }));

    it('should upload the service artifact to the S3 bucket', () =>
      runServerless(Object.assign({ cwd: fixtures.map.customArtifact }, runServelessOptions)).then(
        serverless => {
          const uploadRequest = serverless
            .getProvider('aws')
            .request.args.find(
              ([service, method, body]) =>
                service === 'S3' && method === 'upload' && body.Key.endsWith('custom-artifact.zip')
            );
          expect(uploadRequest).to.be.an('array');
          const requestBody = uploadRequest[2];
          expect(requestBody.Bucket).to.equal(bucketName);
        }
      ));
  });

  describe('#uploadCustomResources()', () => {
    it('should upload the service artifact to the S3 bucket', () =>
      runServerless(Object.assign({ cwd: fixtures.map.customResource }, runServelessOptions)).then(
        serverless => {
          const uploadRequest = serverless
            .getProvider('aws')
            .request.args.find(
              ([service, method, body]) =>
                service === 'S3' && method === 'upload' && body.Key.endsWith('custom-resources.zip')
            );
          expect(uploadRequest).to.be.an('array');
          const requestBody = uploadRequest[2];
          expect(requestBody.Bucket).to.equal(bucketName);
        }
      ));
  });
});
