'use strict';

const BbPromise = require('bluebird');

module.exports = {
  uploadCloudFormationTemplateToS3Bucket() {
    this.serverless.cli.log('Uploading CloudFormation file to S3...');

    const body = JSON.stringify(this.serverless.service.provider.compiledCloudFormationTemplate);

    const params = {
      Bucket: this.bucketName,
      Key: 'compiled-cloudformation-template.json',
      Body: body,
    };

    return this.sdk.request('S3',
      'putObject',
      params,
      this.options.stage,
      this.options.region);
  },

  uploadCloudFormationTemplate() {
    if (this.options.noDeploy) {
      return BbPromise.resolve();
    }

    return BbPromise.bind(this)
      .then(this.uploadCloudFormationTemplateToS3Bucket);
  },
};
