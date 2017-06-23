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

    // also save the template under the "old" name
    // TODO remove later on when old name is deprecated
    const alternativeFileName = 'compiled-cloudformation-template.json';
    const alternativeTemplateFilePath = path.join(
      this.serverless.config.servicePath,
      '.serverless',
      alternativeFileName
    );
    this.serverless.utils.writeFileSync(alternativeTemplateFilePath,
      this.serverless.service.provider.compiledCloudFormationTemplate);

    return BbPromise.resolve();
  },
};
