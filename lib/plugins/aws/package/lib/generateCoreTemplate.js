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

    if (bucketName) {
      return BbPromise.bind(this)
        .then(() => this.validateS3BucketName(bucketName))
        .then(() => this.provider.request('S3',
          'getBucketLocation',
          {
            Bucket: bucketName,
          },
          this.options.stage,
          this.options.region
        ))
        .catch(err => {
          throw new this.serverless.classes.Error(
            `Could not locate deployment bucket. Error: ${err.message}`
          );
        })
        .then(resultParam => {
          const result = resultParam;
          if (result.LocationConstraint === '') result.LocationConstraint = 'us-east-1';
          if (result.LocationConstraint === 'EU') result.LocationConstraint = 'eu-west-1';
          if (result.LocationConstraint !== this.options.region) {
            throw new this.serverless.classes.Error(
              'Deployment bucket is not in the same region as the lambda function'
            );
          }
          this.bucketName = bucketName;
          this.serverless.service.package.deploymentBucket = bucketName;
          this.serverless.service.provider.compiledCloudFormationTemplate
            .Outputs.ServerlessDeploymentBucketName.Value = bucketName;

          delete this.serverless.service.provider.compiledCloudFormationTemplate
            .Resources.ServerlessDeploymentBucket;
        });
    }

    if (this.serverless.service.provider.deploymentBucket) {
      return BbPromise.resolve();
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
