'use strict';

const path = require('path');
const chai = require('chai');
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

describe('lib/plugins/aws/package/compile/layers/index.test.js', () => {
  let cfResources;
  let naming;
  let updateConfig;
  let servicePath;
  let service;
  let cfOutputs;

  before(async () => {
    const test = await runServerless({
      fixture: 'layer',
      cliArgs: ['package'],
      configExt: {
        package: {
          individually: true,
        },
        layers: {
          layerOne: {
            path: 'layer',
            allowedAccounts: ['*'],
          },
          layerTwo: {
            description: 'Layer two example',
            path: 'layer',
            compatibleRuntimes: ['nodejs12.x'],
            licenseInfo: 'GPL',
            allowedAccounts: ['123456789012', '123456789013'],
          },
          layerRetain: {
            path: 'layer',
            retain: true,
          },
        },
      },
      awsRequestStubMap,
    });
    const { awsNaming, cfTemplate, fixtureData, serverless } = test;
    cfResources = cfTemplate.Resources;
    cfOutputs = cfTemplate.Outputs;
    naming = awsNaming;
    service = serverless.service;
    ({ updateConfig, servicePath } = fixtureData);
  });

  it('should support `layers[].package.artifact` with `package.individually`', () => {
    const resourceName = 'layer';
    const layerResource = cfResources[naming.getLambdaLayerLogicalId(resourceName)];
    const s3Folder = service.package.artifactDirectoryName;
    const s3FileName = service.layers[resourceName].package.artifact.split(path.sep).pop();

    expect(layerResource.Properties.Content.S3Key).to.be.equal(`${s3Folder}/${s3FileName}`);
  });

  it('should generate expected layer version resource', () => {
    const resourceName = 'layer';
    const layerResource = cfResources[naming.getLambdaLayerLogicalId(resourceName)];
    const s3Folder = service.package.artifactDirectoryName;
    const s3FileName = service.layers[resourceName].package.artifact.split(path.sep).pop();

    expect(layerResource.Type).to.be.equals('AWS::Lambda::LayerVersion');
    expect(layerResource.Properties.Content.S3Key).to.be.equal(`${s3Folder}/${s3FileName}`);
    expect(layerResource.Properties.LayerName).to.be.equal('layer');
    expect(layerResource.Properties.Content.S3Bucket.Ref).to.be.equal('ServerlessDeploymentBucket');

    expect(cfOutputs.LayerLambdaLayerQualifiedArn.Description).to.be.equals(
      'Current Lambda layer version'
    );
    expect(cfOutputs.LayerLambdaLayerQualifiedArn.Value.Ref).to.be.equals('LayerLambdaLayer');
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
    });
  });

  it('should generate expected permissions resource', () => {
    const layerResourceName = naming.getLambdaLayerLogicalId('LayerOne');
    const layerOne = cfResources[layerResourceName];
    const s3Folder = service.package.artifactDirectoryName;
    const s3FileName = service.layers.layerOne.package.artifact.split(path.sep).pop();

    expect(layerOne.Type).to.be.equals('AWS::Lambda::LayerVersion');
    expect(layerOne.Properties.Content.S3Key).to.be.equals(`${s3Folder}/${s3FileName}`);
    expect(layerOne.Properties.Content.S3Bucket.Ref).to.be.equals('ServerlessDeploymentBucket');
    expect(layerOne.Properties.LayerName).to.be.equals('layerOne');

    const description = 'Current Lambda layer version';
    expect(cfOutputs.LayerLambdaLayerQualifiedArn.Description).to.be.equals(description);
    expect(cfOutputs.LayerLambdaLayerQualifiedArn.Value.Ref).to.be.equals('LayerLambdaLayer');

    const layerNamePermission = naming.getLambdaLayerPermissionLogicalId('LayerOne', 'Wild');
    const layerPermission = cfResources[layerNamePermission];

    expect(layerPermission.Type).to.be.equals('AWS::Lambda::LayerVersionPermission');
    expect(layerPermission.Properties.Action).to.be.equals('lambda:GetLayerVersion');
    expect(layerPermission.Properties.LayerVersionArn.Ref).to.be.equals('LayerOneLambdaLayer');
    expect(layerPermission.Properties.Principal).to.be.equals('*');
  });

  it('should support `layers[].allowedAccounts`', () => {
    const layerResourceName = naming.getLambdaLayerLogicalId('LayerTwo');
    const layerTwo = cfResources[layerResourceName];
    const s3Folder = service.package.artifactDirectoryName;
    const s3FileName = service.layers.layerTwo.package.artifact.split(path.sep).pop();

    expect(layerTwo.Type).to.be.equals('AWS::Lambda::LayerVersion');
    expect(layerTwo.Properties.Content.S3Key).to.be.equals(`${s3Folder}/${s3FileName}`);
    expect(layerTwo.Properties.Content.S3Bucket.Ref).to.be.equals('ServerlessDeploymentBucket');
    expect(layerTwo.Properties.LayerName).to.be.equals('layerTwo');

    const description = 'Current Lambda layer version';
    expect(cfOutputs.LayerLambdaLayerQualifiedArn.Description).to.be.equals(description);
    expect(cfOutputs.LayerLambdaLayerQualifiedArn.Value.Ref).to.be.equals('LayerLambdaLayer');

    const layerNamePermissionFirstUser = naming.getLambdaLayerPermissionLogicalId(
      'layerTwo',
      '123456789012'
    );
    const layerPermissionFirstUser = cfResources[layerNamePermissionFirstUser];

    expect(layerPermissionFirstUser.Type).to.be.equals('AWS::Lambda::LayerVersionPermission');
    expect(layerPermissionFirstUser.Properties.Action).to.be.equals('lambda:GetLayerVersion');
    expect(layerPermissionFirstUser.Properties.LayerVersionArn.Ref).to.be.equals(
      'LayerTwoLambdaLayer'
    );
    expect(layerPermissionFirstUser.Properties.Principal).to.be.equals('123456789012');

    const layerNamePermissionUserSecond = naming.getLambdaLayerPermissionLogicalId(
      'layerTwo',
      '123456789013'
    );
    const layerPermissionSecondUser = cfResources[layerNamePermissionUserSecond];

    expect(layerPermissionSecondUser.Type).to.be.equals('AWS::Lambda::LayerVersionPermission');
    expect(layerPermissionSecondUser.Properties.Action).to.be.equals('lambda:GetLayerVersion');
    expect(layerPermissionSecondUser.Properties.LayerVersionArn.Ref).to.be.equals(
      'LayerTwoLambdaLayer'
    );
    expect(layerPermissionSecondUser.Properties.Principal).to.be.equals('123456789013');
  });

  it('should support `layers[].description`', () => {
    const layerResourceName = naming.getLambdaLayerLogicalId('LayerTwo');
    const layerOne = cfResources[layerResourceName];

    expect(layerOne.Type).to.be.equals('AWS::Lambda::LayerVersion');
    expect(layerOne.Properties.Description).to.be.equals('Layer two example');
  });

  it('should support `layers[].compatibleRuntimes`', () => {
    const layerResourceName = naming.getLambdaLayerLogicalId('LayerTwo');
    const layerOne = cfResources[layerResourceName];

    expect(layerOne.Type).to.be.equals('AWS::Lambda::LayerVersion');
    expect(layerOne.Properties.CompatibleRuntimes).to.be.deep.equals(['nodejs12.x']);
  });

  it('should support `layers[].licenseInfo`', () => {
    const layerResourceName = naming.getLambdaLayerLogicalId('LayerTwo');
    const layerOne = cfResources[layerResourceName];

    expect(layerOne.Type).to.be.equals('AWS::Lambda::LayerVersion');
    expect(layerOne.Properties.LicenseInfo).to.be.deep.equals('GPL');
  });
});
