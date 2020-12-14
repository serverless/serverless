'use strict';

const path = require('path');
const chai = require('chai');
const sinon = require('sinon');
const AwsProvider = require('../../../../../../../lib/plugins/aws/provider/awsProvider');
const AwsCompileLayers = require('../../../../../../../lib/plugins/aws/package/compile/layers');
const Serverless = require('../../../../../../../lib/Serverless');
const { getTmpDirPath } = require('../../../../../../utils/fs');
const runServerless = require('../../../../../../utils/run-serverless');

chai.use(require('chai-as-promised'));

const expect = chai.expect;

const awsRequestStubMap = {
  CloudFormation: {
    describeStacks: {
      Stacks: [
        {
          Outputs: [
            { OutputKey: 'LayerLambdaLayerHash', OutputValue: '1qaz' },
            { OutputKey: 'LayerLambdaLayerS3Key', OutputValue: 'a/b/c/foo.zip' },
          ],
        },
      ],
    },
  },
};

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

describe('lib/plugins/aws/package/compile/layers/index.test.js', () => {
  let cfResources;
  let naming;
  let updateConfig;
  let servicePath;

  before(async () => {
    const { awsNaming, cfTemplate, fixtureData } = await runServerless({
      fixture: 'layer',
      cliArgs: ['package'],
      configExt: {
        layers: {
          layerRetain: {
            path: 'layer',
            retain: true,
          },
        },
      },
      awsRequestStubMap,
    });
    cfResources = cfTemplate.Resources;
    naming = awsNaming;
    ({ updateConfig, servicePath } = fixtureData);
  });

  it.skip('TODO: should support `layers[].package.artifact` with `package.individually`', () => {
    // Replaces
    // https://github.com/serverless/serverless/blob/e78f695004bf292c4163daf9705e5e0c6cbe2592/test/unit/lib/plugins/aws/package/compile/layers/index.test.js#L90-L106
  });

  it.skip('TODO: should generate expected layer version resource', () => {
    // Replaces
    // https://github.com/serverless/serverless/blob/e78f695004bf292c4163daf9705e5e0c6cbe2592/test/unit/lib/plugins/aws/package/compile/layers/index.test.js#L108-L145
  });

  describe('`layers[].retain` property', () => {
    it('should ensure expected deletion policy', () => {
      const layerResourceNamePrefix = naming.getLambdaLayerLogicalId('layerRetain');
      const layerResourceName = Object.keys(cfResources).find(resourceName =>
        resourceName.startsWith(layerResourceNamePrefix)
      );
      expect(layerResourceName).to.not.equal(layerResourceNamePrefix);
      const layerResource = cfResources[layerResourceName];
      expect(layerResource.DeletionPolicy).to.equal('Retain');
    });

    it('should ensure unique resource id per layer version', async () => {
      const layerResourceNamePrefix = naming.getLambdaLayerLogicalId('layerRetain');
      const firstLayerResourceName = Object.keys(cfResources).find(resourceName =>
        resourceName.startsWith(layerResourceNamePrefix)
      );

      await updateConfig({ layers: { layerRetain: { description: 'foo' } } });
      const {
        cfTemplate: { Resources: secondCfResources },
      } = await runServerless({
        cwd: servicePath,
        cliArgs: ['package'],
        awsRequestStubMap,
      });
      expect(secondCfResources).to.not.have.property(firstLayerResourceName);

      await updateConfig({ layers: { layerRetain: { description: null } } });
      const {
        cfTemplate: { Resources: firstCfResources },
      } = await runServerless({
        cwd: servicePath,
        cliArgs: ['package'],
        awsRequestStubMap,
      });
      expect(firstCfResources).to.have.property(firstLayerResourceName);
      // Replaces
      // https://github.com/serverless/serverless/blob/e78f695004bf292c4163daf9705e5e0c6cbe2592/test/unit/lib/plugins/aws/package/compile/layers/index.test.js#L147-L329
    });
  });

  it.skip('TODO: should generate expected permissions resource', () => {
    // Replaces
    // https://github.com/serverless/serverless/blob/e78f695004bf292c4163daf9705e5e0c6cbe2592/test/unit/lib/plugins/aws/package/compile/layers/index.test.js#L331-L383
  });

  it.skip('TODO: should support `layers[].allowedAccounts`', () => {
    // Replaces
    // https://github.com/serverless/serverless/blob/e78f695004bf292c4163daf9705e5e0c6cbe2592/test/unit/lib/plugins/aws/package/compile/layers/index.test.js#L331-L452
  });

  it.skip('TODO: should support `layers[].description`', () => {
    // Replaces partially
    // https://github.com/serverless/serverless/blob/e78f695004bf292c4163daf9705e5e0c6cbe2592/test/unit/lib/plugins/aws/package/compile/layers/index.test.js#L454-L497
  });

  it.skip('TODO: should support `layers[].compatibleRuntimes`', () => {
    // Replaces partially
    // https://github.com/serverless/serverless/blob/e78f695004bf292c4163daf9705e5e0c6cbe2592/test/unit/lib/plugins/aws/package/compile/layers/index.test.js#L454-L497
  });

  it.skip('TODO: should support `layers[].licenseInfo`', () => {
    // Replaces partially
    // https://github.com/serverless/serverless/blob/e78f695004bf292c4163daf9705e5e0c6cbe2592/test/unit/lib/plugins/aws/package/compile/layers/index.test.js#L454-L497
  });
});
