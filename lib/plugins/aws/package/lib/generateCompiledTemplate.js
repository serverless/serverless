'use strict';

const BbPromise = require('bluebird');
const path = require('path');

module.exports = {
  generateCompiledTemplate() {
    const compiledTemplateFileName = this.provider.naming.getCompiledTemplateFileName();

    const compiledTemplateFilePath = path.join(this.packagePath, compiledTemplateFileName);

    this.serverless.utils.writeFileSync(compiledTemplateFilePath,
      this.serverless.service.provider.compiledCloudFormationTemplate);

    return BbPromise.resolve();
  },

};
