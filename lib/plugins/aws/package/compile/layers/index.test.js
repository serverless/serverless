'use strict';

const crypto = require('crypto');
const path = require('path');
const chai = require('chai');
const fs = require('fs');
const sinon = require('sinon');
const _ = require('lodash');
const AwsProvider = require('../../../provider/awsProvider');
const AwsCompileLayers = require('./index');
const Serverless = require('../../../../../Serverless');
const { getTmpDirPath } = require('../../../../../../test/utils/fs');

chai.use(require('chai-as-promised'));

const expect = chai.expect;

describe('AwsCompileLayers', () => {
  let serverless;
  let awsCompileLayers;
  let awsProvider;
  let providerRequestStub;

  const layerName = 'test';
  const compiledLayerName = 'TestLambdaLayer';

  beforeEach(() => {
    const options = {
      stage: 'dev',
      region: 'us-east-1',
    };
    serverless = new Serverless(options);
    awsProvider = new AwsProvider(serverless, options);
    serverless.setProvider('aws', awsProvider);
    serverless.cli = new serverless.classes.CLI();
    serverless.config.servicePath = process.cwd();
    awsCompileLayers = new AwsCompileLayers(serverless, options);
    awsCompileLayers.serverless.service.provider.compiledCloudFormationTemplate = {
      Resources: {},
      Outputs: {},
    };
    providerRequestStub = sinon.stub(awsCompileLayers.provider, 'request');

    const serviceArtifact = 'new-service.zip';
    const individualArtifact = 'test.zip';
    awsCompileLayers.packagePath = getTmpDirPath();
    // The contents of the test artifacts need to be predictable so the hashes stay the same
    serverless.utils.writeFileSync(
      path.join(awsCompileLayers.packagePath, serviceArtifact),
      'foobar'
    );
    serverless.utils.writeFileSync(
      path.join(awsCompileLayers.packagePath, individualArtifact),
      'barbaz'
    );

    awsCompileLayers.serverless.service.service = 'new-service';
    awsCompileLayers.serverless.service.package.artifactDirectoryName = 'somedir';
    awsCompileLayers.serverless.service.package.artifact = path.join(
      awsCompileLayers.packagePath,
      serviceArtifact
    );
    awsCompileLayers.serverless.service.layers = {};
    awsCompileLayers.serverless.service.layers[layerName] = {
      name: 'test',
      package: {
        artifact: path.join(awsCompileLayers.packagePath, individualArtifact),
      },
      handler: 'handler.hello',
    };

    providerRequestStub.withArgs('CloudFormation', 'describeStacks').resolves({
      Stacks: [
        {
          Outputs: [
            { OutputKey: 'TestLambdaLayerHash', OutputValue: '1qaz' },
            { OutputKey: 'TestLambdaLayerS3Key', OutputValue: 'a/b/c/foo.zip' },
          ],
        },
      ],
    });
  });

  describe('#constructor()', () => {
    it('should set the provider variable to an instance of AwsProvider', () =>
      expect(awsCompileLayers.provider).to.be.instanceof(AwsProvider));
  });

  describe('#compileLayers()', () => {
    it('should use layer artifact if individually', () => {
      awsCompileLayers.serverless.service.package.individually = true;

      return expect(awsCompileLayers.compileLayers()).to.be.fulfilled.then(() => {
        const layerResource =
          awsCompileLayers.serverless.service.provider.compiledCloudFormationTemplate.Resources[
            compiledLayerName
          ];

        const s3Folder = awsCompileLayers.serverless.service.package.artifactDirectoryName;
        const s3FileName = awsCompileLayers.serverless.service.layers[layerName].package.artifact
          .split(path.sep)
          .pop();

        expect(layerResource.Properties.Content.S3Key).to.deep.equal(`${s3Folder}/${s3FileName}`);
      });
    });

    it('should create a simple layer resource', () => {
      const s3Folder = awsCompileLayers.serverless.service.package.artifactDirectoryName;
      const s3FileName = awsCompileLayers.serverless.service.layers.test.package.artifact
        .split(path.sep)
        .pop();
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

      return expect(awsCompileLayers.compileLayers()).to.be.fulfilled.then(() => {
        expect(
          awsCompileLayers.serverless.service.provider.compiledCloudFormationTemplate.Resources
            .TestLambdaLayer
        ).to.deep.equal(compiledLayer);
        expect(
          awsCompileLayers.serverless.service.provider.compiledCloudFormationTemplate.Outputs
            .TestLambdaLayerQualifiedArn
        ).to.deep.equal(compiledLayerOutput);
      });
    });

    it('should create a layer resource with a retention policy', () => {
      const s3Folder = awsCompileLayers.serverless.service.package.artifactDirectoryName;
      const s3FileName = awsCompileLayers.serverless.service.layers.test.package.artifact
        .split(path.sep)
        .pop();
      awsCompileLayers.serverless.service.layers = {
        test: {
          path: 'layer',
          retain: true,
        },
      };
      const compiledLayer = {
        Type: 'AWS::Lambda::LayerVersion',
        Properties: {
          Content: {
            S3Bucket: { Ref: 'ServerlessDeploymentBucket' },
            S3Key: `${s3Folder}/${s3FileName}`,
          },
          LayerName: 'test',
        },
      };
      const layerArtifactBinary = fs.readFileSync(
        path.join(awsCompileLayers.packagePath, 'test.zip')
      );

      const sha = crypto
        .createHash('sha1')
        .update(JSON.stringify(_.omit(compiledLayer, ['Properties.Content.S3Key'])))
        .update(layerArtifactBinary)
        .digest('hex');
      compiledLayer.DeletionPolicy = 'Retain';
      const compiledLayerOutput = {
        Description: 'Current Lambda layer version',
        Value: {
          Ref: `TestLambdaLayer${sha}`,
        },
      };

      return expect(awsCompileLayers.compileLayers()).to.be.fulfilled.then(() => {
        expect(
          awsCompileLayers.serverless.service.provider.compiledCloudFormationTemplate.Resources[
            `TestLambdaLayer${sha}`
          ]
        ).to.deep.equal(compiledLayer);
        expect(
          awsCompileLayers.serverless.service.provider.compiledCloudFormationTemplate.Outputs
            .TestLambdaLayerQualifiedArn
        ).to.deep.equal(compiledLayerOutput);
      });
    });

    it('should create a layer resource with a retention policy, has the same logical id when not modify', () => {
      awsCompileLayers.serverless.service.layers = {
        test: {
          path: 'layer',
          retain: true,
        },
      };
      const secondAwsCompileLayers = _.cloneDeep(awsCompileLayers);
      secondAwsCompileLayers.serverless.service.package.artifactDirectoryName = 'somedir2';

      const secondProviderRequestStub = sinon.stub(secondAwsCompileLayers.provider, 'request');
      secondProviderRequestStub.withArgs('CloudFormation', 'describeStacks').resolves({
        Stacks: [
          {
            Outputs: [
              {
                OutputKey: 'TestLambdaLayerHash',
                OutputValue: '18c9a02dcb78d62bb202964f0da15366b9730863',
              },
              { OutputKey: 'TestLambdaLayerS3Key', OutputValue: 'somedir/test.zip' },
            ],
          },
        ],
      });

      return expect(
        Promise.all([awsCompileLayers.compileLayers(), secondAwsCompileLayers.compileLayers()])
      ).to.be.fulfilled.then(() => {
        const resources =
          awsCompileLayers.serverless.service.provider.compiledCloudFormationTemplate.Resources;
        const secondResources =
          secondAwsCompileLayers.serverless.service.provider.compiledCloudFormationTemplate
            .Resources;
        expect(
          Object.keys(resources).find(key => resources[key].Type === 'AWS::Lambda::LayerVersion')
        ).to.deep.equal(
          Object.keys(secondResources).find(
            key => secondResources[key].Type === 'AWS::Lambda::LayerVersion'
          )
        );
        expect(
          awsCompileLayers.serverless.service.provider.compiledCloudFormationTemplate.Outputs
            .TestLambdaLayerQualifiedArn
        ).to.deep.equal(
          secondAwsCompileLayers.serverless.service.provider.compiledCloudFormationTemplate.Outputs
            .TestLambdaLayerQualifiedArn
        );
        expect(
          awsCompileLayers.serverless.service.provider.compiledCloudFormationTemplate.Outputs
            .TestLambdaLayerHash
        ).to.deep.equal(
          secondAwsCompileLayers.serverless.service.provider.compiledCloudFormationTemplate.Outputs
            .TestLambdaLayerHash,
          'Hash should be same if layer is NOT modified'
        );
        expect(
          awsCompileLayers.serverless.service.provider.compiledCloudFormationTemplate.Outputs
            .TestLambdaLayerS3Key.Value
        ).to.deep.equal(
          secondAwsCompileLayers.serverless.service.provider.compiledCloudFormationTemplate.Outputs
            .TestLambdaLayerS3Key.Value,
          'S3Key should be same if layer is NOT modified'
        );
      });
    });

    it('should create a layer resource with a retention policy, has different logical id when modify', () => {
      awsCompileLayers.serverless.service.layers = {
        test: {
          path: 'layer',
          retain: true,
        },
      };
      const secondAwsCompileLayers = _.cloneDeep(awsCompileLayers);
      secondAwsCompileLayers.serverless.service.layers.test.description = 'modified description';
      secondAwsCompileLayers.serverless.service.package.artifactDirectoryName = 'somedir2';

      const secondProviderRequestStub = sinon.stub(secondAwsCompileLayers.provider, 'request');
      secondProviderRequestStub.withArgs('CloudFormation', 'describeStacks').resolves({
        Stacks: [
          {
            Outputs: [
              {
                OutputKey: 'TestLambdaLayerHash',
                OutputValue: '18c9a02dcb78d62bb202964f0da15366b9730863',
              },
              { OutputKey: 'TestLambdaLayerS3Key', OutputValue: 'a/b/c/foo.zip' },
            ],
          },
        ],
      });

      return expect(
        Promise.all([awsCompileLayers.compileLayers(), secondAwsCompileLayers.compileLayers()])
      ).to.be.fulfilled.then(() => {
        const resources =
          awsCompileLayers.serverless.service.provider.compiledCloudFormationTemplate.Resources;
        const secondResources =
          secondAwsCompileLayers.serverless.service.provider.compiledCloudFormationTemplate
            .Resources;
        expect(
          Object.keys(resources).find(key => resources[key].Type === 'AWS::Lambda::LayerVersion')
        ).to.not.deep.equal(
          Object.keys(secondResources).find(
            key => secondResources[key].Type === 'AWS::Lambda::LayerVersion'
          )
        );
        expect(
          awsCompileLayers.serverless.service.provider.compiledCloudFormationTemplate.Outputs
            .TestLambdaLayerQualifiedArn
        ).to.not.deep.equal(
          secondAwsCompileLayers.serverless.service.provider.compiledCloudFormationTemplate.Outputs
            .TestLambdaLayerQualifiedArn
        );
        expect(
          awsCompileLayers.serverless.service.provider.compiledCloudFormationTemplate.Outputs
            .TestLambdaLayerHash
        ).to.not.deep.equal(
          secondAwsCompileLayers.serverless.service.provider.compiledCloudFormationTemplate.Outputs
            .TestLambdaLayerHash,
          'Hash should be different if layer is modified'
        );
        expect(
          awsCompileLayers.serverless.service.provider.compiledCloudFormationTemplate.Outputs
            .TestLambdaLayerS3Key.Value
        ).to.not.deep.equal(
          secondAwsCompileLayers.serverless.service.provider.compiledCloudFormationTemplate.Outputs
            .TestLambdaLayerS3Key.Value,
          'S3Key should be different if layer is modified'
        );
      });
    });

    it('should create a layer resource with permissions', () => {
      const s3Folder = awsCompileLayers.serverless.service.package.artifactDirectoryName;
      const s3FileName = awsCompileLayers.serverless.service.layers.test.package.artifact
        .split(path.sep)
        .pop();
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

      return expect(awsCompileLayers.compileLayers()).to.be.fulfilled.then(() => {
        expect(
          awsCompileLayers.serverless.service.provider.compiledCloudFormationTemplate.Resources
            .TestLambdaLayer
        ).to.deep.equal(compiledLayer);
        expect(
          awsCompileLayers.serverless.service.provider.compiledCloudFormationTemplate.Outputs
            .TestLambdaLayerQualifiedArn
        ).to.deep.equal(compiledLayerOutput);
        expect(
          awsCompileLayers.serverless.service.provider.compiledCloudFormationTemplate.Resources
            .TestWildLambdaLayerPermission
        ).to.deep.equal(compiledLayerVersion);
      });
    });

    it('should create a layer resource with permissions per account', () => {
      const s3Folder = awsCompileLayers.serverless.service.package.artifactDirectoryName;
      const s3FileName = awsCompileLayers.serverless.service.layers.test.package.artifact
        .split(path.sep)
        .pop();
      awsCompileLayers.serverless.service.layers = {
        test: {
          path: 'layer',
          allowedAccounts: ['1111111', '2222222'],
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

      return expect(awsCompileLayers.compileLayers()).to.be.fulfilled.then(() => {
        expect(
          awsCompileLayers.serverless.service.provider.compiledCloudFormationTemplate.Resources
            .TestLambdaLayer
        ).to.deep.equal(compiledLayer);
        expect(
          awsCompileLayers.serverless.service.provider.compiledCloudFormationTemplate.Outputs
            .TestLambdaLayerQualifiedArn
        ).to.deep.equal(compiledLayerOutput);
        expect(
          awsCompileLayers.serverless.service.provider.compiledCloudFormationTemplate.Resources
            .Test1111111LambdaLayerPermission
        ).to.deep.equal(compiledLayerVersionNumber);
        expect(
          awsCompileLayers.serverless.service.provider.compiledCloudFormationTemplate.Resources
            .Test2222222LambdaLayerPermission
        ).to.deep.equal(compiledLayerVersionString);
      });
    });

    it('should create a layer resource with metadata options set', () => {
      const s3Folder = awsCompileLayers.serverless.service.package.artifactDirectoryName;
      const s3FileName = awsCompileLayers.serverless.service.layers.test.package.artifact
        .split(path.sep)
        .pop();
      awsCompileLayers.serverless.service.layers = {
        test: {
          path: 'layer',
          description: 'desc',
          compatibleRuntimes: ['nodejs12.x'],
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
          CompatibleRuntimes: ['nodejs12.x'],
          LicenseInfo: 'GPL',
        },
      };
      const compiledLayerOutput = {
        Description: 'Current Lambda layer version',
        Value: {
          Ref: 'TestLambdaLayer',
        },
      };

      return expect(awsCompileLayers.compileLayers()).to.be.fulfilled.then(() => {
        expect(
          awsCompileLayers.serverless.service.provider.compiledCloudFormationTemplate.Resources
            .TestLambdaLayer
        ).to.deep.equal(compiledLayer);
        expect(
          awsCompileLayers.serverless.service.provider.compiledCloudFormationTemplate.Outputs
            .TestLambdaLayerQualifiedArn
        ).to.deep.equal(compiledLayerOutput);
      });
    });
  });
});
