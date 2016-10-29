'use strict';

const BbPromise = require('bluebird');
const path = require('path');

module.exports = {
  configureStack() {
    this.serverless.service.provider
      .compiledCloudFormationTemplate = this.serverless.utils.readFileSync(
      path.join(this.serverless.config.serverlessPath,
        'plugins',
        'aws',
        'deploy',
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
          }
        ))
        .then(resultParam => {
          const result = resultParam;
          if (result.LocationConstraint === '') {
            result.LocationConstraint = this.provider.getRegion();
          }
          if (result.LocationConstraint !== this.options.region) {
            throw new this.serverless.classes.Error(
              'Deployment bucket is not in the same region as the lambda function'
            );
          }
          this.bucketName = bucketName;
          this.serverless.service.package.deploymentBucket = bucketName;
          this.serverless.service.provider.compiledCloudFormationTemplate.Outputs[
              this.provider.naming.getLogicalDeploymentBucketOutputVariableName()
            ].Value = bucketName;

          delete this.serverless.service.provider.compiledCloudFormationTemplate
            .Resources[this.provider.naming.getLogicalDeploymentBucketName()];
        });
    }

    return BbPromise.resolve();
  },

};
