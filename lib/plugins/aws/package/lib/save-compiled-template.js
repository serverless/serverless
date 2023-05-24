'use strict';

const fs = require('fs').promises;
const path = require('path');

module.exports = {
  async saveCompiledTemplate() {
    const compiledTemplateFileName = this.provider.naming.getCompiledTemplateFileName();

    const compiledTemplateFilePath = path.join(
      this.serverless.serviceDir,
      '.serverless',
      compiledTemplateFileName
    );

    const shouldMinify = this.options['minify-template'];

    const templateContents = this.serverless.service.provider.compiledCloudFormationTemplate;
    const stringTemplateContents = JSON.stringify(templateContents, null, shouldMinify ? 0 : 2);

    await fs.mkdir(path.dirname(compiledTemplateFilePath), { recursive: true });
    await fs.writeFile(compiledTemplateFilePath, stringTemplateContents);
  },
};
