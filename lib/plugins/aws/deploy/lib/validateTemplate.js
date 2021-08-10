'use strict';

const getS3EndpointForRegion = require('../../utils/getS3EndpointForRegion');
const ServerlessError = require('../../../../serverless-error');

module.exports = {
  async validateTemplate() {
    const templatePath = await this.provider.getCompiledTemplateS3Path();
    const s3Endpoint = getS3EndpointForRegion(this.provider.getRegion());
    this.serverless.cli.log('Validating template...');
    const params = {
      TemplateURL: `https://${s3Endpoint}/${this.bucketName}/${templatePath}`,
    };

    return this.provider.request('CloudFormation', 'validateTemplate', params).catch((error) => {
      const errorMessage = ['The CloudFormation template is invalid:', ` ${error.message}`].join(
        ''
      );
      throw new ServerlessError(errorMessage, 'INVALID_AWS_CLOUDFORMATION_TEMPLATE');
    });
  },
};
