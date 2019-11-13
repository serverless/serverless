'use strict';
const getCompiledTemplateS3Suffix = require('../../lib/naming').getCompiledTemplateS3Suffix;
const getS3EndpointForRegion = require('../../utils/getS3EndpointForRegion');

module.exports = {
  validateTemplate() {
    const bucketName = this.bucketName;
    const artifactDirectoryName = this.serverless.service.package.artifactDirectoryName;
    const compiledTemplateFileName = getCompiledTemplateS3Suffix();
    const s3Endpoint = getS3EndpointForRegion(this.provider.getRegion());
    this.serverless.cli.log('Validating template...');
    const params = {
      TemplateURL: `https://${s3Endpoint}/${bucketName}/${artifactDirectoryName}/${compiledTemplateFileName}`,
    };

    return this.provider.request('CloudFormation', 'validateTemplate', params).catch(error => {
      const errorMessage = ['The CloudFormation template is invalid:', ` ${error.message}`].join(
        ''
      );
      throw new Error(errorMessage);
    });
  },
};
