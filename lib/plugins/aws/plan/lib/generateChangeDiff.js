'use strict';

const diff = require('json-diff').diffString;
const normalizeFiles = require('../../lib/normalizeFiles');

module.exports = {
  generateChangeDiff() {

    const stackName = this.provider.naming.getStackName();

    const compiledCfTemplate = this.serverless.service.provider.compiledCloudFormationTemplate;
    // const normCfTemplate = normalizeFiles.normalizeCloudFormationTemplate(compiledCfTemplate);

    this.provider.request(
      'CloudFormation',
      'getTemplate',
      { StackName: stackName },
      this.options.stage,
      this.options.region
    )
      .then((res) => console.log(diff(JSON.parse(res.TemplateBody), compiledCfTemplate)));
  },
};
