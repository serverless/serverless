'use strict';

const chai = require('chai');
const runServerless = require('../../../../../../utils/run-serverless');
const expect = require('chai').expect;

chai.use(require('chai-as-promised'));
chai.use(require('sinon-chai'));

describe('#generateCoreTemplate()', () => {
  it('should reject non-HTTPS requests to the deployment bucket', () =>
    runServerless({
      config: { service: 'irrelevant', provider: 'aws' },
      command: 'package',
    }).then(({ cfTemplate }) => {
      const serverlessDeploymentBucketPolicy =
        cfTemplate.Resources.ServerlessDeploymentBucketPolicy;

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
          {
            'Fn::Join': [
              '',
              ['arn:', { Ref: 'AWS::Partition' }, ':s3:::', { Ref: 'ServerlessDeploymentBucket' }],
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

    return runServerless({
      config: {
        service: 'irrelevant',
        provider: { name: 'aws', deploymentBucket: bucketName },
      },
      command: 'package',
    }).then(({ cfTemplate }) => {
      const template = cfTemplate;
      expect(template.Outputs.ServerlessDeploymentBucketName.Value).to.equal(bucketName);
      expect(template.Resources.ServerlessDeploymentBucket).to.not.exist;
      expect(template.Resources.ServerlessDeploymentBucketPolicy).to.not.exist;
    });
  });

  it('should enable S3 Block Public Access & versioning if specified', () =>
    runServerless({
      config: {
        service: 'irrelevant',
        provider: {
          name: 'aws',
          deploymentBucket: {
            blockPublicAccess: true,
            versioning: true,
          },
        },
      },
      command: 'package',
    }).then(({ cfTemplate }) => {
      expect(cfTemplate.Resources.ServerlessDeploymentBucket.Properties).to.deep.include({
        PublicAccessBlockConfiguration: {
          BlockPublicAcls: true,
          BlockPublicPolicy: true,
          IgnorePublicAcls: true,
          RestrictPublicBuckets: true,
        },
        VersioningConfiguration: {
          Status: 'Enabled',
        },
      });
    }));

  it('should add resource tags to the bucket if present', () =>
    runServerless({
      config: {
        service: 'irrelevant',
        provider: {
          name: 'aws',
          deploymentBucket: {
            tags: {
              FOO: 'bar',
              BAZ: 'qux',
            },
          },
        },
      },
      command: 'package',
    }).then(({ cfTemplate }) => {
      expect(cfTemplate.Resources.ServerlessDeploymentBucket).to.be.deep.equal({
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

  it('should result in error for custom bucket and accelerate flag', async () => {
    const bucketName = 'com.serverless.deploys';

    await expect(
      runServerless({
        config: {
          service: 'irrelevant',
          provider: {
            name: 'aws',
            deploymentBucket: bucketName,
          },
        },
        awsRequestStubMap: {
          S3: { getBucketLocation: { LocationConstraint: '' } },
          STS: {
            getCallerIdentity: {
              ResponseMetadata: { RequestId: 'ffffffff-ffff-ffff-ffff-ffffffffffff' },
              UserId: 'XXXXXXXXXXXXXXXXXXXXX',
              Account: '1234567890',
              Arn: 'arn:aws:iam::1234567890:user/test',
            },
          },
        },
        command: 'deploy',
        options: { 'aws-s3-accelerate': true },
        lastLifecycleHookName: 'before:deploy:deploy',
      })
    ).to.eventually.be.rejected.and.have.property(
      'code',
      'S3_TRANSFER_ACCELERATION_ON_EXISTING_BUCKET'
    );
  });

  it('should use a auto generated bucket if you does not specify deploymentBucket', () =>
    runServerless({
      config: { service: 'irrelevant', provider: 'aws' },
      command: 'package',
    }).then(({ cfTemplate }) => {
      expect(cfTemplate.Resources.ServerlessDeploymentBucket).to.be.deep.equal({
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
    runServerless({
      config: { service: 'irrelevant', provider: 'aws' },
      command: 'deploy',
      options: { 'aws-s3-accelerate': true },
      lastLifecycleHookName: 'before:deploy:deploy',
      awsRequestStubMap: {
        STS: {
          getCallerIdentity: {
            ResponseMetadata: { RequestId: 'ffffffff-ffff-ffff-ffff-ffffffffffff' },
            UserId: 'XXXXXXXXXXXXXXXXXXXXX',
            Account: '1234567890',
            Arn: 'arn:aws:iam::1234567890:user/test',
          },
        },
      },
    }).then(({ cfTemplate: template }) => {
      expect(template.Outputs.ServerlessDeploymentBucketAccelerated).to.not.equal(null);
      expect(template.Outputs.ServerlessDeploymentBucketAccelerated.Value).to.equal(true);
    }));

  it('should explicitly disable S3 Transfer Acceleration, if requested', () =>
    runServerless({
      config: { service: 'irrelevant', provider: 'aws' },
      command: 'deploy',
      options: { 'aws-s3-accelerate': false },
      lastLifecycleHookName: 'before:deploy:deploy',
      awsRequestStubMap: {
        STS: {
          getCallerIdentity: {
            ResponseMetadata: { RequestId: 'ffffffff-ffff-ffff-ffff-ffffffffffff' },
            UserId: 'XXXXXXXXXXXXXXXXXXXXX',
            Account: '1234567890',
            Arn: 'arn:aws:iam::1234567890:user/test',
          },
        },
      },
    }).then(({ cfTemplate: template }) => {
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
    runServerless({
      config: { service: 'irrelevant', provider: { name: 'aws', region: 'us-gov-west-1' } },
      command: 'deploy',
      awsRequestStubMap: {
        STS: {
          getCallerIdentity: {
            ResponseMetadata: { RequestId: 'ffffffff-ffff-ffff-ffff-ffffffffffff' },
            UserId: 'XXXXXXXXXXXXXXXXXXXXX',
            Account: '1234567890',
            Arn: 'arn:aws:iam::1234567890:user/test',
          },
        },
      },
      options: { 'aws-s3-accelerate': false },
      lastLifecycleHookName: 'before:deploy:deploy',
    }).then(({ cfTemplate: template }) => {
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

  it('should not create ServerlessDeploymentBucketPolicy resource if requested', async () => {
    const { cfTemplate, awsNaming } = await runServerless({
      config: {
        service: 'irrelevant',
        provider: {
          name: 'aws',
          deploymentBucket: {
            skipPolicySetup: true,
          },
        },
      },
      command: 'package',
    });

    expect(cfTemplate.Resources).to.not.have.property(
      awsNaming.getDeploymentBucketPolicyLogicalId()
    );
  });
});
