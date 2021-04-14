'use strict';

const path = require('path');

module.exports = {
  async saveCompiledTemplate() {
    const compiledTemplateFileName = this.provider.naming.getCompiledTemplateFileName();

    const compiledTemplateFilePath = path.join(
      this.serverless.serviceDir,
      '.serverless',
      compiledTemplateFileName
    );

    this.serverless.utils.writeFileSync(
      compiledTemplateFilePath,
      this.serverless.service.provider.compiledCloudFormationTemplate
    );
  },
};
