'use strict';

const BbPromise = require('bluebird');
const path = require('path');

module.exports = {
  saveCompiledTemplate() {
    const compiledTemplateFileName = this.provider.naming.getCompiledTemplateFileName();

    const compiledTemplateFilePath = path.join(
      this.serverless.config.servicePath,
      '.serverless',
      compiledTemplateFileName
    );

    const compiledTemplate = this.serverless.service.provider.compiledCloudFormationTemplate;
    const customIAMPolicyStatement = compiledTemplate
      .Resources[this.provider.naming.getPolicyLogicalId()]
      .Properties
      .PolicyDocument
      .Statement;
    // remove custom IAM Policy if no custom statements (empty array would be invalid for CF)
    if (!customIAMPolicyStatement.length) {
      delete compiledTemplate.Resources[this.provider.naming.getPolicyLogicalId()];
    }

    this.serverless.utils.writeFileSync(compiledTemplateFilePath, compiledTemplate);

    return BbPromise.resolve();
  },
};
