'use strict';

const sinon = require('sinon');
const path = require('path');
const chai = require('chai');
const AwsProvider = require('../../provider/awsProvider');
const Serverless = require('../../../../Serverless');
const validate = require('../../lib/validate');
const generateCoreTemplate = require('./generateCoreTemplate');
const expect = require('chai').expect;
const { getTmpDirPath } = require('../../../../../tests/utils/fs');

chai.use(require('chai-as-promised'));

describe('#generateCoreTemplate()', () => {
  let serverless;
  const awsPlugin = {};
  const functionName = 'test';

  beforeEach(() => {
    serverless = new Serverless();
    awsPlugin.serverless = serverless;
    awsPlugin.provider = new AwsProvider(serverless, {});
    awsPlugin.options = {
      stage: 'dev',
      region: 'us-east-1',
    };

    Object.assign(awsPlugin, generateCoreTemplate, validate);

    awsPlugin.serverless.cli = new serverless.classes.CLI();
    awsPlugin.serverless.config.servicePath = getTmpDirPath();

    awsPlugin.serverless.service.provider.compiledCloudFormationTemplate = {
      Resources: {},
      Outputs: {},
    };
    awsPlugin.serverless.service.service = 'new-service';
    awsPlugin.serverless.service.functions = {
      [functionName]: {
        name: 'test',
        artifact: 'test.zip',
        handler: 'handler.hello',
      },
    };
  });

  it('should reject non-HTTPS requests to the deployment bucket', () => {
    return expect(awsPlugin.generateCoreTemplate()).to.be.fulfilled.then(() => {
      const serverlessDeploymentBucketPolicy =
        awsPlugin.serverless.service.provider.compiledCloudFormationTemplate.Resources
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
          { 'Fn::Join': ['', ['arn:aws:s3:::', { Ref: 'ServerlessDeploymentBucket' }, '/*']] },
        ],
        Condition: {
          Bool: { 'aws:SecureTransport': false },
        },
      });
    });
  });

  it('should use a custom bucket if specified', () => {
    const bucketName = 'com.serverless.deploys';

    awsPlugin.serverless.service.provider.deploymentBucket = bucketName;

    const coreCloudFormationTemplate = awsPlugin.serverless.utils.readFileSync(
      path.join(__dirname, 'core-cloudformation-template.json')
    );
    awsPlugin.serverless.service.provider.compiledCloudFormationTemplate = coreCloudFormationTemplate;

    return expect(awsPlugin.generateCoreTemplate()).to.be.fulfilled.then(() => {
      const template = awsPlugin.serverless.service.provider.compiledCloudFormationTemplate;
      expect(template.Outputs.ServerlessDeploymentBucketName.Value).to.equal(bucketName);
      expect(template.Resources.ServerlessDeploymentBucket).to.not.exist;
      expect(template.Resources.ServerlessDeploymentBucketPolicy).to.not.exist;
    });
  });

  it('should enable S3 Block Public Access if specified', () => {
    const deploymentBucketObject = {
      blockPublicAccess: true,
    };

    awsPlugin.serverless.service.provider.deploymentBucketObject = deploymentBucketObject;

    return expect(awsPlugin.generateCoreTemplate()).to.be.fulfilled.then(() => {
      expect(
        awsPlugin.serverless.service.provider.compiledCloudFormationTemplate.Resources
          .ServerlessDeploymentBucket.Properties
      ).to.deep.include({
        PublicAccessBlockConfiguration: {
          BlockPublicAcls: true,
          BlockPublicPolicy: true,
          IgnorePublicAcls: true,
          RestrictPublicBuckets: true,
        },
      });
    });
  });

  it('should add resource tags to the bucket if present', () => {
    const deploymentBucketObject = {
      tags: {
        FOO: 'bar',
        BAZ: 'qux',
      },
    };

    awsPlugin.serverless.service.provider.deploymentBucketObject = deploymentBucketObject;

    return expect(awsPlugin.generateCoreTemplate()).to.be.fulfilled.then(() => {
      expect(
        awsPlugin.serverless.service.provider.compiledCloudFormationTemplate.Resources
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
          Tags: [{ Key: 'FOO', Value: 'bar' }, { Key: 'BAZ', Value: 'qux' }],
        },
      });
    });
  });

  it('should use a custom bucket if specified, even with S3 transfer acceleration', () => {
    const bucketName = 'com.serverless.deploys';

    awsPlugin.serverless.service.provider.deploymentBucket = bucketName;
    awsPlugin.provider.options['aws-s3-accelerate'] = true;

    const coreCloudFormationTemplate = awsPlugin.serverless.utils.readFileSync(
      path.join(__dirname, 'core-cloudformation-template.json')
    );
    awsPlugin.serverless.service.provider.compiledCloudFormationTemplate = coreCloudFormationTemplate;

    return expect(awsPlugin.generateCoreTemplate()).to.be.fulfilled.then(() => {
      const template = awsPlugin.serverless.service.provider.compiledCloudFormationTemplate;
      expect(template.Outputs.ServerlessDeploymentBucketName.Value).to.equal(bucketName);
      // eslint-disable-next-line no-unused-expressions
      expect(template.Resources.ServerlessDeploymentBucket).to.not.exist;
      // eslint-disable-next-line no-unused-expressions
      expect(template.Outputs.ServerlessDeploymentBucketAccelerated).to.not.exist;
    });
  });

  it('should use a auto generated bucket if you does not specify deploymentBucket', () =>
    expect(awsPlugin.generateCoreTemplate()).to.be.fulfilled.then(() => {
      expect(
        awsPlugin.serverless.service.provider.compiledCloudFormationTemplate.Resources
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

  it('should add a deployment bucket to the CF template, if not provided', () => {
    sinon.stub(awsPlugin.provider, 'request').resolves();
    sinon.stub(serverless.utils, 'writeFileSync').resolves();
    serverless.config.servicePath = './';

    return awsPlugin.generateCoreTemplate().then(() => {
      const template = serverless.service.provider.coreCloudFormationTemplate;
      expect(template).to.not.equal(null);
    });
  });

  it('should add a custom output if S3 Transfer Acceleration is enabled', () => {
    sinon.stub(awsPlugin.provider, 'request').resolves();
    sinon.stub(serverless.utils, 'writeFileSync').resolves();
    serverless.config.servicePath = './';
    awsPlugin.provider.options['aws-s3-accelerate'] = true;

    return awsPlugin.generateCoreTemplate().then(() => {
      const template = serverless.service.provider.coreCloudFormationTemplate;
      expect(template.Outputs.ServerlessDeploymentBucketAccelerated).to.not.equal(null);
      expect(template.Outputs.ServerlessDeploymentBucketAccelerated.Value).to.equal(true);
    });
  });

  it('should explicitly disable S3 Transfer Acceleration, if requested', () => {
    sinon.stub(awsPlugin.provider, 'request').resolves();
    sinon.stub(serverless.utils, 'writeFileSync').resolves();
    serverless.config.servicePath = './';
    awsPlugin.provider.options['no-aws-s3-accelerate'] = true;

    return awsPlugin.generateCoreTemplate().then(() => {
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
    });
  });

  it('should exclude AccelerateConfiguration for govcloud region', () => {
    sinon.stub(awsPlugin.provider, 'request').resolves();
    sinon.stub(serverless.utils, 'writeFileSync').resolves();
    serverless.config.servicePath = './';
    awsPlugin.provider.options.region = 'us-gov-west-1';

    return awsPlugin.generateCoreTemplate().then(() => {
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
    });
  });

  it('should explode if transfer acceleration is both enabled and disabled', () => {
    sinon.stub(awsPlugin.provider, 'request').resolves();
    sinon.stub(serverless.utils, 'writeFileSync').resolves();
    serverless.config.servicePath = './';
    awsPlugin.provider.options['aws-s3-accelerate'] = true;
    awsPlugin.provider.options['no-aws-s3-accelerate'] = true;

    return expect(awsPlugin.generateCoreTemplate()).to.be.rejectedWith(
      serverless.classes.Error,
      /at the same time/
    );
  });
});
