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

    this.serverless.utils.writeFileSync(compiledTemplateFilePath,
      this.serverless.service.provider.compiledCloudFormationTemplate);

    return BbPromise.resolve();
  },
};
