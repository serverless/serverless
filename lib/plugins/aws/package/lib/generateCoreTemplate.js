'use strict';

const BbPromise = require('bluebird');
const path = require('path');
const _ = require('lodash');

const validateS3BucketName = require('../../lib/validateS3BucketName');

module.exports = {
  generateCoreTemplate() {
    _.assign(
      this,
      validateS3BucketName
    );

    this.serverless.service.provider
      .compiledCloudFormationTemplate = this.serverless.utils.readFileSync(
      path.join(this.serverless.config.serverlessPath,
        'plugins',
        'aws',
        'package',
        'lib',
        'core-cloudformation-template.json')
    );

    const bucketName = this.serverless.service.provider.deploymentBucket;
    const isS3TransferAccelerationEnabled = this.provider.isS3TransferAccelerationEnabled();

    if (bucketName) {
      return BbPromise.bind(this)
        .then(() => this.validateS3BucketName(bucketName))
        .then(() => {
          if (isS3TransferAccelerationEnabled) {
            const warningMessage =
              'Warning: S3 Transfer Acceleration will not be enabled on deploymentBucket.';
            this.serverless.cli.log(warningMessage);
          }
          this.bucketName = bucketName;
          this.serverless.service.package.deploymentBucket = bucketName;
          this.serverless.service.provider.compiledCloudFormationTemplate
            .Outputs.ServerlessDeploymentBucketName.Value = bucketName;

          delete this.serverless.service.provider.compiledCloudFormationTemplate
            .Resources.ServerlessDeploymentBucket;
        });
    }

    this.serverless.service.provider.compiledCloudFormationTemplate
      .Resources.ServerlessDeploymentBucket.Properties = {
        AccelerateConfiguration: {
          AccelerationStatus:
            isS3TransferAccelerationEnabled ? 'Enabled' : 'Suspended',
        },
      };

    if (isS3TransferAccelerationEnabled) {
      this.serverless.service.provider.compiledCloudFormationTemplate
      .Outputs.ServerlessDeploymentBucketAccelerated = { Value: true };
    }

    const coreTemplateFileName = this.provider.naming.getCoreTemplateFileName();

    const coreTemplateFilePath = path.join(this.serverless.config.servicePath,
      '.serverless',
      coreTemplateFileName);

    this.serverless.utils.writeFileSync(coreTemplateFilePath,
      this.serverless.service.provider.compiledCloudFormationTemplate);

    this.serverless.service.provider.coreCloudFormationTemplate =
      _.cloneDeep(this.serverless.service.provider.compiledCloudFormationTemplate);

    return BbPromise.resolve();
  },

};
