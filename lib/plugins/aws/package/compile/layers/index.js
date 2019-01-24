'use strict';

const BbPromise = require('bluebird');
const _ = require('lodash');
const path = require('path');

class AwsCompileLayers {
  constructor(serverless, options) {
    this.serverless = serverless;
    this.options = options;
    const servicePath = this.serverless.config.servicePath || '';
    this.packagePath = this.serverless.service.package.path ||
      path.join(servicePath || '.', '.serverless');

    this.provider = this.serverless.getProvider('aws');

    this.hooks = {
      'package:compileLayers': () => BbPromise.bind(this)
        .then(this.compileLayers),
    };
  }

  compileLayer(layerName) {
    const newLayer = this.cfLambdaLayerTemplate();
    const layerObject = this.serverless.service.getLayer(layerName);
    layerObject.package = layerObject.package || {};

    const artifactFileName = this.provider.naming.getLayerArtifactName(layerName);
    const artifactFilePath = layerObject.package && layerObject.package.artifact
      ? layerObject.package.artifact
      : path.join(this.serverless.config.servicePath, '.serverless', artifactFileName);

    if (this.serverless.service.package.deploymentBucket) {
      newLayer.Properties.Content.S3Bucket = this.serverless.service.package.deploymentBucket;
    }

    const s3Folder = this.serverless.service.package.artifactDirectoryName;
    const s3FileName = artifactFilePath.split(path.sep).pop();
    newLayer.Properties.Content.S3Key = `${s3Folder}/${s3FileName}`;

    newLayer.Properties.LayerName = layerObject.name || layerName;
    if (layerObject.description) {
      newLayer.Properties.Description = layerObject.description;
    }
    if (layerObject.licenseInfo) {
      newLayer.Properties.LicenseInfo = layerObject.licenseInfo;
    }
    if (layerObject.compatibleRuntimes) {
      newLayer.Properties.CompatibleRuntimes = layerObject.compatibleRuntimes;
    }

    const layerLogicalId = this.provider.naming.getLambdaLayerLogicalId(layerName);
    const newLayerObject = {
      [layerLogicalId]: newLayer,
    };

    if (layerObject.allowedAccounts) {
      layerObject.allowedAccounts.map(account => {
        let parsedAccount = account;
        // cast to string if account is number
        if (typeof account === 'number' && !isNaN(account)) {
          parsedAccount = `${account}`;
        }
        const newPermission = this.cfLambdaLayerPermissionTemplate();
        newPermission.Properties.LayerVersionArn = { Ref: layerLogicalId };
        newPermission.Properties.Principal = parsedAccount;
        const layerPermLogicalId = this.provider.naming.getLambdaLayerPermissionLogicalId(
          layerName, parsedAccount);
        newLayerObject[layerPermLogicalId] = newPermission;
        return newPermission;
      });
    }

    _.merge(this.serverless.service.provider.compiledCloudFormationTemplate.Resources,
      newLayerObject);

    // Add layer to Outputs section
    const layerOutputLogicalId = this.provider.naming
      .getLambdaLayerOutputLogicalId(layerName);
    const newLayerOutput = this.cfOutputLayerTemplate();

    newLayerOutput.Value = { Ref: layerLogicalId };

    _.merge(this.serverless.service.provider.compiledCloudFormationTemplate.Outputs, {
      [layerOutputLogicalId]: newLayerOutput,
    });
  }

  compileLayers() {
    const allLayers = this.serverless.service.getAllLayers();
    return BbPromise.each(
      allLayers,
      layerName => this.compileLayer(layerName)
    );
  }

  cfLambdaLayerTemplate() {
    return {
      Type: 'AWS::Lambda::LayerVersion',
      Properties: {
        Content: {
          S3Bucket: {
            Ref: 'ServerlessDeploymentBucket',
          },
          S3Key: 'S3Key',
        },
        LayerName: 'LayerName',
      },
    };
  }

  cfLambdaLayerPermissionTemplate() {
    return {
      Type: 'AWS::Lambda::LayerVersionPermission',
      Properties: {
        Action: 'lambda:GetLayerVersion',
        LayerVersionArn: 'LayerVersionArn',
        Principal: 'Principal',
      },
    };
  }

  cfOutputLayerTemplate() {
    return {
      Description: 'Current Lambda layer version',
      Value: 'Value',
    };
  }
}

module.exports = AwsCompileLayers;
