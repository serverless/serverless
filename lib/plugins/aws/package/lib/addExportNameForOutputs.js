'use strict';

module.exports = {
  addExportNameForOutputs() {
    if (!this.serverless.service.provider.disableDefaultOutputExportNames) {
      const outputs = this.serverless.service.provider.compiledCloudFormationTemplate.Outputs;
      for (const [key, data] of Object.entries(outputs)) {
        if (!data.Export) {
          data.Export = {
            Name: `sls-${this.serverless.service.service}-${this.provider.getStage()}-${key}`,
          };
        }
      }
    }
  },
};
