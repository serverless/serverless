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
  const allowedAccount = 'arn:aws:iam::123456789012:root';
  let cfResources;
  let naming;
  let updateConfig;
  let serviceDir;
  let service;
  let cfOutputs;

  before(async () => {
    const { awsNaming, cfTemplate, fixtureData, serverless } = await runServerless({
      fixture: 'layer',
      command: 'package',
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
            compatibleArchitectures: ['arm64'],
            licenseInfo: 'GPL',
            allowedAccounts: ['123456789012', '123456789013'],
          },
          layerRetain: {
            path: 'layer',
            retain: true,
            allowedAccounts: [allowedAccount],
          },
        },
      },
      awsRequestStubMap,
    });
    cfResources = cfTemplate.Resources;
    cfOutputs = cfTemplate.Outputs;
    naming = awsNaming;
    service = serverless.service;
    ({ updateConfig, servicePath: serviceDir } = fixtureData);
  });

  it('should support `layers[].package.artifact` with `package.individually`', () => {
    const resourceName = 'layer';
    const layerResource = cfResources[naming.getLambdaLayerLogicalId(resourceName)];
    const s3Folder = service.package.artifactDirectoryName;
    const s3FileName = service.layers[resourceName].package.artifact.split(path.sep).pop();

    expect(layerResource.Properties.Content.S3Key).to.equal(`${s3Folder}/${s3FileName}`);
  });

  it('should generate expected layer version resource', () => {
    const resourceName = 'layer';
    const layerResource = cfResources[naming.getLambdaLayerLogicalId(resourceName)];
    const s3Folder = service.package.artifactDirectoryName;
    const s3FileName = service.layers[resourceName].package.artifact.split(path.sep).pop();

    expect(layerResource.Type).to.equals('AWS::Lambda::LayerVersion');
    expect(layerResource.Properties.Content.S3Key).to.equal(`${s3Folder}/${s3FileName}`);
    expect(layerResource.Properties.LayerName).to.equal('layer');
    expect(layerResource.Properties.Content.S3Bucket.Ref).to.equal('ServerlessDeploymentBucket');

    expect(cfOutputs.LayerLambdaLayerQualifiedArn.Description).to.equals(
      'Current Lambda layer version'
    );
    expect(cfOutputs.LayerLambdaLayerQualifiedArn.Value.Ref).to.equals('LayerLambdaLayer');
  });

  describe('`layers[].retain` property', () => {
    it('should ensure expected deletion policy for layer resource', () => {
      const layerResourceNamePrefix = naming.getLambdaLayerLogicalId('layerRetain');
      const layerResourceName = Object.keys(cfResources).find((resourceName) =>
        resourceName.startsWith(layerResourceNamePrefix)
      );
      expect(layerResourceName).to.not.equal(layerResourceNamePrefix);
      const layerResource = cfResources[layerResourceName];
      expect(layerResource.DeletionPolicy).to.equal('Retain');
    });

    it('should ensure expected deletion policy for layer permission resource', () => {
      const layerPermissionResourceNamePrefix = naming.getLambdaLayerPermissionLogicalId(
        'layerRetain',
        allowedAccount
      );
      const layerPermissionResourceName = Object.keys(cfResources).find((resourceName) =>
        resourceName.startsWith(layerPermissionResourceNamePrefix)
      );
      expect(layerPermissionResourceName).to.not.equal(layerPermissionResourceNamePrefix);
      const layerPermissionResource = cfResources[layerPermissionResourceName];
      expect(layerPermissionResource.DeletionPolicy).to.equal('Retain');
    });

    it('should ensure unique resource id per layer version', async () => {
      const layerResourceNamePrefix = naming.getLambdaLayerLogicalId('layerRetain');
      const firstLayerResourceName = Object.keys(cfResources).find((resourceName) =>
        resourceName.startsWith(layerResourceNamePrefix)
      );

      await updateConfig({ layers: { layerRetain: { description: 'foo' } } });
      const {
        cfTemplate: { Resources: secondCfResources },
      } = await runServerless({
        cwd: serviceDir,
        command: 'package',
        awsRequestStubMap,
      });
      expect(secondCfResources).to.not.have.property(firstLayerResourceName);

      await updateConfig({ layers: { layerRetain: { description: null } } });
      const {
        cfTemplate: { Resources: firstCfResources },
      } = await runServerless({
        cwd: serviceDir,
        command: 'package',
        awsRequestStubMap,
      });
      expect(firstCfResources).to.have.property(firstLayerResourceName);
    });
  });

  it('should generate expected permissions resource', () => {
    const layerNamePermission = naming.getLambdaLayerPermissionLogicalId('LayerOne', 'Wild');
    const layerPermission = cfResources[layerNamePermission];

    expect(layerPermission.Type).to.equals('AWS::Lambda::LayerVersionPermission');
    expect(layerPermission.Properties.Action).to.equals('lambda:GetLayerVersion');
    expect(layerPermission.Properties.LayerVersionArn.Ref).to.equals('LayerOneLambdaLayer');
    expect(layerPermission.Properties.Principal).to.equals('*');
  });

  it('should support `layers[].allowedAccounts`', () => {
    const layerNamePermissionFirstUser = naming.getLambdaLayerPermissionLogicalId(
      'layerTwo',
      '123456789012'
    );
    const layerPermissionFirstUser = cfResources[layerNamePermissionFirstUser];
    expect(layerPermissionFirstUser.Properties.Principal).to.equals('123456789012');

    const layerNamePermissionUserSecond = naming.getLambdaLayerPermissionLogicalId(
      'layerTwo',
      '123456789013'
    );
    const layerPermissionSecondUser = cfResources[layerNamePermissionUserSecond];
    expect(layerPermissionSecondUser.Properties.Principal).to.equals('123456789013');
  });

  it('should support `layers[].description`', () => {
    const layerResourceName = naming.getLambdaLayerLogicalId('LayerTwo');
    const layerOne = cfResources[layerResourceName];

    expect(layerOne.Type).to.equals('AWS::Lambda::LayerVersion');
    expect(layerOne.Properties.Description).to.equals('Layer two example');
  });

  it('should support `layers[].compatibleRuntimes`', () => {
    const layerResourceName = naming.getLambdaLayerLogicalId('LayerTwo');
    const layerOne = cfResources[layerResourceName];

    expect(layerOne.Type).to.equals('AWS::Lambda::LayerVersion');
    expect(layerOne.Properties.CompatibleRuntimes).to.deep.equals(['nodejs12.x']);
  });

  it('should support `layers[].compatibleArchitectures`', () => {
    const layerResourceName = naming.getLambdaLayerLogicalId('LayerTwo');
    const layerOne = cfResources[layerResourceName];

    expect(layerOne.Properties.CompatibleArchitectures).to.deep.equals(['arm64']);
  });

  it('should support `layers[].licenseInfo`', () => {
    const layerResourceName = naming.getLambdaLayerLogicalId('LayerTwo');
    const layerOne = cfResources[layerResourceName];

    expect(layerOne.Type).to.equals('AWS::Lambda::LayerVersion');
    expect(layerOne.Properties.LicenseInfo).to.deep.equals('GPL');
  });
});
