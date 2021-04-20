'use strict';

module.exports = {
  addExportNameForOutputs() {
    const outputs = this.serverless.service.provider.compiledCloudFormationTemplate.Outputs;
    Object.keys(outputs).forEach((key) => {
      outputs[key] = Object.assign({}, outputs[key], {
        Export: {
          Name: `sls-${this.serverless.service.service}-${this.provider.getStage()}-${key}`,
        },
      });
    });
  },
};
