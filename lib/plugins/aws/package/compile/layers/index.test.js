'use strict';

const path = require('path');
const chai = require('chai');
const AwsProvider = require('../../../provider/awsProvider');
const AwsCompileLayers = require('./index');
const testUtils = require('../../../../../../tests/utils');
const Serverless = require('../../../../../Serverless');

chai.use(require('chai-as-promised'));

const expect = chai.expect;

describe('AwsCompileLayers', () => {
  let serverless;
  let awsCompileLayers;
  const layerName = 'test';
  const compiledLayerName = 'TestLambdaLayer';

  beforeEach(() => {
    const options = {
      stage: 'dev',
      region: 'us-east-1',
    };
    serverless = new Serverless(options);
    serverless.setProvider('aws', new AwsProvider(serverless, options));
    serverless.cli = new serverless.classes.CLI();
    serverless.config.servicePath = process.cwd();
    awsCompileLayers = new AwsCompileLayers(serverless, options);
    awsCompileLayers.serverless.service.provider.compiledCloudFormationTemplate = {
      Resources: {},
      Outputs: {},
    };

    const serviceArtifact = 'new-service.zip';
    const individualArtifact = 'test.zip';
    awsCompileLayers.packagePath = testUtils.getTmpDirPath();
    // The contents of the test artifacts need to be predictable so the hashes stay the same
    serverless.utils.writeFileSync(path.join(awsCompileLayers.packagePath,
      serviceArtifact), 'foobar');
    serverless.utils.writeFileSync(path.join(awsCompileLayers.packagePath,
      individualArtifact), 'barbaz');

    awsCompileLayers.serverless.service.service = 'new-service';
    awsCompileLayers.serverless.service.package.artifactDirectoryName = 'somedir';
    awsCompileLayers.serverless.service.package
      .artifact = path.join(awsCompileLayers.packagePath, serviceArtifact);
    awsCompileLayers.serverless.service.layers = {};
    awsCompileLayers.serverless.service.layers[layerName] = {
      name: 'test',
      package: {
        artifact: path.join(awsCompileLayers.packagePath,
          individualArtifact),
      },
      handler: 'handler.hello',
    };
  });

  describe('#constructor()', () => {
    it('should set the provider variable to an instance of AwsProvider', () =>
      expect(awsCompileLayers.provider).to.be.instanceof(AwsProvider));
  });

  describe('#compileLayers()', () => {
    it('should use layer artifact if individually', () => {
      awsCompileLayers.serverless.service.package.individually = true;

      return expect(awsCompileLayers.compileLayers()).to.be.fulfilled
      .then(() => {
        const layerResource = awsCompileLayers.serverless.service.provider
          .compiledCloudFormationTemplate.Resources[compiledLayerName];

        const s3Folder = awsCompileLayers.serverless.service.package.artifactDirectoryName;
        const s3FileName = awsCompileLayers.serverless.service
          .layers[layerName].package.artifact.split(path.sep).pop();

        expect(layerResource.Properties.Content.S3Key)
          .to.deep.equal(`${s3Folder}/${s3FileName}`);
      });
    });

    it('should create a simple layer resource', () => {
      const s3Folder = awsCompileLayers.serverless.service.package.artifactDirectoryName;
      const s3FileName = awsCompileLayers.serverless.service.layers.test.package.artifact
        .split(path.sep).pop();
      awsCompileLayers.serverless.service.layers = {
        test: {
          path: 'layer',
        },
      };
      const compiledLayer = {
        Type: 'AWS::Lambda::LayerVersion',
        Properties: {
          Content: {
            S3Key: `${s3Folder}/${s3FileName}`,
            S3Bucket: { Ref: 'ServerlessDeploymentBucket' },
          },
          LayerName: 'test',
        },
      };
      const compiledLayerOutput = {
        Description: 'Current Lambda layer version',
        Value: {
          Ref: 'TestLambdaLayer',
        },
      };

      return expect(awsCompileLayers.compileLayers()).to.be.fulfilled
      .then(() => {
        expect(
          awsCompileLayers.serverless.service.provider.compiledCloudFormationTemplate
            .Resources.TestLambdaLayer
        ).to.deep.equal(compiledLayer);
        expect(
          awsCompileLayers.serverless.service.provider.compiledCloudFormationTemplate
            .Outputs.TestLambdaLayerQualifiedArn
        ).to.deep.equal(compiledLayerOutput);
      });
    });

    it('should create a layer resource with permissions', () => {
      const s3Folder = awsCompileLayers.serverless.service.package.artifactDirectoryName;
      const s3FileName = awsCompileLayers.serverless.service.layers.test.package.artifact
        .split(path.sep).pop();
      awsCompileLayers.serverless.service.layers = {
        test: {
          path: 'layer',
          allowedAccounts: ['*'],
        },
      };
      const compiledLayer = {
        Type: 'AWS::Lambda::LayerVersion',
        Properties: {
          Content: {
            S3Key: `${s3Folder}/${s3FileName}`,
            S3Bucket: { Ref: 'ServerlessDeploymentBucket' },
          },
          LayerName: 'test',
        },
      };
      const compiledLayerOutput = {
        Description: 'Current Lambda layer version',
        Value: {
          Ref: 'TestLambdaLayer',
        },
      };
      const compiledLayerVersion = {
        Type: 'AWS::Lambda::LayerVersionPermission',
        Properties: {
          Action: 'lambda:GetLayerVersion',
          LayerVersionArn: {
            Ref: 'TestLambdaLayer',
          },
          Principal: '*',
        },
      };

      return expect(awsCompileLayers.compileLayers()).to.be.fulfilled
      .then(() => {
        expect(
          awsCompileLayers.serverless.service.provider.compiledCloudFormationTemplate
            .Resources.TestLambdaLayer
        ).to.deep.equal(compiledLayer);
        expect(
          awsCompileLayers.serverless.service.provider.compiledCloudFormationTemplate
            .Outputs.TestLambdaLayerQualifiedArn
        ).to.deep.equal(compiledLayerOutput);
        expect(
          awsCompileLayers.serverless.service.provider.compiledCloudFormationTemplate
            .Resources.TestWildLambdaLayerPermission
        ).to.deep.equal(compiledLayerVersion);
      });
    });

    it('should create a layer resource with permissions per account', () => {
      const s3Folder = awsCompileLayers.serverless.service.package.artifactDirectoryName;
      const s3FileName = awsCompileLayers.serverless.service.layers.test.package.artifact
        .split(path.sep).pop();
      awsCompileLayers.serverless.service.layers = {
        test: {
          path: 'layer',
          allowedAccounts: [1111111, '2222222'],
        },
      };
      const compiledLayer = {
        Type: 'AWS::Lambda::LayerVersion',
        Properties: {
          Content: {
            S3Key: `${s3Folder}/${s3FileName}`,
            S3Bucket: { Ref: 'ServerlessDeploymentBucket' },
          },
          LayerName: 'test',
        },
      };
      const compiledLayerOutput = {
        Description: 'Current Lambda layer version',
        Value: {
          Ref: 'TestLambdaLayer',
        },
      };
      const compiledLayerVersionNumber = {
        Type: 'AWS::Lambda::LayerVersionPermission',
        Properties: {
          Action: 'lambda:GetLayerVersion',
          LayerVersionArn: {
            Ref: 'TestLambdaLayer',
          },
          Principal: '1111111',
        },
      };

      const compiledLayerVersionString = {
        Type: 'AWS::Lambda::LayerVersionPermission',
        Properties: {
          Action: 'lambda:GetLayerVersion',
          LayerVersionArn: {
            Ref: 'TestLambdaLayer',
          },
          Principal: '2222222',
        },
      };

      return expect(awsCompileLayers.compileLayers()).to.be.fulfilled
      .then(() => {
        expect(
          awsCompileLayers.serverless.service.provider.compiledCloudFormationTemplate
            .Resources.TestLambdaLayer
        ).to.deep.equal(compiledLayer);
        expect(
          awsCompileLayers.serverless.service.provider.compiledCloudFormationTemplate
            .Outputs.TestLambdaLayerQualifiedArn
        ).to.deep.equal(compiledLayerOutput);
        expect(
          awsCompileLayers.serverless.service.provider.compiledCloudFormationTemplate
            .Resources.Test1111111LambdaLayerPermission
        ).to.deep.equal(compiledLayerVersionNumber);
        expect(
          awsCompileLayers.serverless.service.provider.compiledCloudFormationTemplate
            .Resources.Test2222222LambdaLayerPermission
        ).to.deep.equal(compiledLayerVersionString);
      });
    });

    it('should create a layer resource with metadata options set', () => {
      const s3Folder = awsCompileLayers.serverless.service.package.artifactDirectoryName;
      const s3FileName = awsCompileLayers.serverless.service.layers.test.package.artifact
        .split(path.sep).pop();
      awsCompileLayers.serverless.service.layers = {
        test: {
          path: 'layer',
          description: 'desc',
          compatibleRuntimes: ['nodejs8.10'],
          licenseInfo: 'GPL',
        },
      };
      const compiledLayer = {
        Type: 'AWS::Lambda::LayerVersion',
        Properties: {
          Content: {
            S3Key: `${s3Folder}/${s3FileName}`,
            S3Bucket: { Ref: 'ServerlessDeploymentBucket' },
          },
          LayerName: 'test',
          Description: 'desc',
          CompatibleRuntimes: ['nodejs8.10'],
          LicenseInfo: 'GPL',
        },
      };
      const compiledLayerOutput = {
        Description: 'Current Lambda layer version',
        Value: {
          Ref: 'TestLambdaLayer',
        },
      };

      return expect(awsCompileLayers.compileLayers()).to.be.fulfilled
      .then(() => {
        expect(
          awsCompileLayers.serverless.service.provider.compiledCloudFormationTemplate
            .Resources.TestLambdaLayer
        ).to.deep.equal(compiledLayer);
        expect(
          awsCompileLayers.serverless.service.provider.compiledCloudFormationTemplate
            .Outputs.TestLambdaLayerQualifiedArn
        ).to.deep.equal(compiledLayerOutput);
      });
    });
  });
});
