'use strict';

const chai = require('chai');
const runServerless = require('../../../../../tests/utils/run-serverless');
const expect = require('chai').expect;

chai.use(require('chai-as-promised'));

const runServelessOptions = {
  pluginPathsWhitelist: ['./lib/plugins/aws/package', './lib/plugins/aws/common'],
  lifecycleHookNamesWhitelist: [
    'package:cleanup',
    'package:initialize',
    'aws:common:validate:validate',
  ],
};

describe('#generateCoreTemplate()', () => {
  it('should reject non-HTTPS requests to the deployment bucket', () =>
    runServerless(
      Object.assign(
        {
          config: { service: 'irrelevant', provider: 'aws' },
          cliArgs: ['package'],
        },
        runServelessOptions
      )
    ).then(serverless => {
      const serverlessDeploymentBucketPolicy =
        serverless.service.provider.compiledCloudFormationTemplate.Resources
          .ServerlessDeploymentBucketPolicy;

      expect(serverlessDeploymentBucketPolicy).to.exist;
      expect(serverlessDeploymentBucketPolicy.Type).to.equal('AWS::S3::BucketPolicy');
      expect(serverlessDeploymentBucketPolicy.Properties).to.exist;
      expect(serverlessDeploymentBucketPolicy.Properties.Bucket).to.deep.equal({
        Ref: 'ServerlessDeploymentBucket',
      });

      expect(serverlessDeploymentBucketPolicy.Properties.PolicyDocument).to.exist;
      expect(serverlessDeploymentBucketPolicy.Properties.PolicyDocument.Statement).to.exist;

      expect(serverlessDeploymentBucketPolicy.Properties.PolicyDocument.Statement).to.deep.include({
        Action: 's3:*',
        Effect: 'Deny',
        Principal: '*',
        Resource: [
          {
            'Fn::Join': [
              '',
              [
                'arn:',
                { Ref: 'AWS::Partition' },
                ':s3:::',
                { Ref: 'ServerlessDeploymentBucket' },
                '/*',
              ],
            ],
          },
        ],
        Condition: {
          Bool: { 'aws:SecureTransport': false },
        },
      });
    }));

  it('should use a custom bucket if specified', () => {
    const bucketName = 'com.serverless.deploys';

    return runServerless(
      Object.assign(
        {
          config: {
            service: 'irrelevant',
            provider: { name: 'aws', deploymentBucket: bucketName },
          },
          cliArgs: ['package'],
        },
        runServelessOptions
      )
    ).then(serverless => {
      const template = serverless.service.provider.compiledCloudFormationTemplate;
      expect(template.Outputs.ServerlessDeploymentBucketName.Value).to.equal(bucketName);
      expect(template.Resources.ServerlessDeploymentBucket).to.not.exist;
      expect(template.Resources.ServerlessDeploymentBucketPolicy).to.not.exist;
    });
  });

  it('should enable S3 Block Public Access if specified', () =>
    runServerless(
      Object.assign(
        {
          config: {
            service: 'irrelevant',
            provider: {
              name: 'aws',
              deploymentBucketObject: {
                blockPublicAccess: true,
              },
            },
          },
          cliArgs: ['package'],
        },
        runServelessOptions
      )
    ).then(serverless => {
      expect(
        serverless.service.provider.compiledCloudFormationTemplate.Resources
          .ServerlessDeploymentBucket.Properties
      ).to.deep.include({
        PublicAccessBlockConfiguration: {
          BlockPublicAcls: true,
          BlockPublicPolicy: true,
          IgnorePublicAcls: true,
          RestrictPublicBuckets: true,
        },
      });
    }));

  it('should add resource tags to the bucket if present', () =>
    runServerless(
      Object.assign(
        {
          config: {
            service: 'irrelevant',
            provider: {
              name: 'aws',
              deploymentBucketObject: {
                tags: {
                  FOO: 'bar',
                  BAZ: 'qux',
                },
              },
            },
          },
          cliArgs: ['package'],
        },
        runServelessOptions
      )
    ).then(serverless => {
      expect(
        serverless.service.provider.compiledCloudFormationTemplate.Resources
          .ServerlessDeploymentBucket
      ).to.be.deep.equal({
        Type: 'AWS::S3::Bucket',
        Properties: {
          BucketEncryption: {
            ServerSideEncryptionConfiguration: [
              {
                ServerSideEncryptionByDefault: {
                  SSEAlgorithm: 'AES256',
                },
              },
            ],
          },
          Tags: [
            { Key: 'FOO', Value: 'bar' },
            { Key: 'BAZ', Value: 'qux' },
          ],
        },
      });
    }));

  it('should use a custom bucket if specified, even with S3 transfer acceleration', () => {
    const bucketName = 'com.serverless.deploys';

    return runServerless(
      Object.assign(
        {
          config: {
            service: 'irrelevant',
            provider: {
              name: 'aws',
              deploymentBucket: bucketName,
            },
          },
          cliArgs: ['package', '--aws-s3-accelerate'],
        },
        runServelessOptions
      )
    ).then(serverless => {
      const template = serverless.service.provider.compiledCloudFormationTemplate;
      expect(template.Outputs.ServerlessDeploymentBucketName.Value).to.equal(bucketName);
      // eslint-disable-next-line no-unused-expressions
      expect(template.Resources.ServerlessDeploymentBucket).to.not.exist;
      // eslint-disable-next-line no-unused-expressions
      expect(template.Outputs.ServerlessDeploymentBucketAccelerated).to.not.exist;
    });
  });

  it('should use a auto generated bucket if you does not specify deploymentBucket', () =>
    runServerless(
      Object.assign(
        {
          config: { service: 'irrelevant', provider: 'aws' },
          cliArgs: ['package'],
        },
        runServelessOptions
      )
    ).then(serverless => {
      expect(
        serverless.service.provider.compiledCloudFormationTemplate.Resources
          .ServerlessDeploymentBucket
      ).to.be.deep.equal({
        Type: 'AWS::S3::Bucket',
        Properties: {
          BucketEncryption: {
            ServerSideEncryptionConfiguration: [
              {
                ServerSideEncryptionByDefault: {
                  SSEAlgorithm: 'AES256',
                },
              },
            ],
          },
        },
      });
    }));

  it('should add a custom output if S3 Transfer Acceleration is enabled', () =>
    runServerless(
      Object.assign(
        {
          config: { service: 'irrelevant', provider: 'aws' },
          cliArgs: ['package', '--aws-s3-accelerate'],
        },
        runServelessOptions
      )
    ).then(serverless => {
      const template = serverless.service.provider.coreCloudFormationTemplate;
      expect(template.Outputs.ServerlessDeploymentBucketAccelerated).to.not.equal(null);
      expect(template.Outputs.ServerlessDeploymentBucketAccelerated.Value).to.equal(true);
    }));

  it('should explicitly disable S3 Transfer Acceleration, if requested', () =>
    runServerless(
      Object.assign(
        {
          config: { service: 'irrelevant', provider: 'aws' },
          cliArgs: ['package', '--no-aws-s3-accelerate'],
        },
        runServelessOptions
      )
    ).then(serverless => {
      const template = serverless.service.provider.coreCloudFormationTemplate;
      expect(template.Resources.ServerlessDeploymentBucket).to.be.deep.equal({
        Type: 'AWS::S3::Bucket',
        Properties: {
          AccelerateConfiguration: {
            AccelerationStatus: 'Suspended',
          },
          BucketEncryption: {
            ServerSideEncryptionConfiguration: [
              {
                ServerSideEncryptionByDefault: {
                  SSEAlgorithm: 'AES256',
                },
              },
            ],
          },
        },
      });
    }));

  it('should exclude AccelerateConfiguration for govcloud region', () =>
    runServerless(
      Object.assign(
        {
          config: { service: 'irrelevant', provider: { name: 'aws', region: 'us-gov-west-1' } },
          cliArgs: ['package', '--no-aws-s3-accelerate'],
        },
        runServelessOptions
      )
    ).then(serverless => {
      const template = serverless.service.provider.coreCloudFormationTemplate;
      expect(template.Resources.ServerlessDeploymentBucket).to.be.deep.equal({
        Type: 'AWS::S3::Bucket',
        Properties: {
          BucketEncryption: {
            ServerSideEncryptionConfiguration: [
              {
                ServerSideEncryptionByDefault: {
                  SSEAlgorithm: 'AES256',
                },
              },
            ],
          },
        },
      });
    }));
});
