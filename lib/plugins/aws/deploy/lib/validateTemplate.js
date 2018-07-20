'use strict';
const BbPromise = require('bluebird');
const platform = require('@serverless/platform-sdk');
const getS3EndpointForRegion = require('../../utils/getS3EndpointForRegion');

module.exports = {
  validateTemplate() {
    const bucketName = this.bucketName;
    const artifactDirectoryName = this.serverless.service.package.artifactDirectoryName;
    const compiledTemplateFileName = 'compiled-cloudformation-template.json';
    const s3Endpoint = getS3EndpointForRegion(this.provider.getRegion());
    this.serverless.cli.log('Validating template...');
    const params = {
      TemplateURL: `https://${s3Endpoint}/${bucketName}/${artifactDirectoryName}/${compiledTemplateFileName}`,
    };

    return this.provider.request(
      'CloudFormation',
      'validateTemplate',
      params
    ).then(() => {
      if (!this.serverless.service.deployment || !this.serverless.service.deployment.deploymentId) {
        return this.createDeployment();
      }
      return BbPromise.resolve();
    }).catch((error) => {
      if (this.serverless.service.deployment && this.serverless.service.deployment.deploymentId) {
        const deploymentData = this.serverless.service.deployment;
        deploymentData.status = 'Failed';
        return platform.updateDeployment(deploymentData)
          .then(() => {
            const errorMessage = [
              'The CloudFormation template is invalid:',
              ` ${error.message}`,
            ].join('');
            throw new Error(errorMessage);
          });
      }
      const errorMessage = [
        'The CloudFormation template is invalid:',
        ` ${error.message}`,
      ].join('');
      throw new Error(errorMessage);
    });
  },
};
