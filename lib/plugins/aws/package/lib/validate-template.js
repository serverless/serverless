// Improve error reporting for Framework specific functionalities

'use strict';

const ServerlessError = require('../../../../serverless-error');

module.exports = {
  validateTemplate() {
    if (this.console.isEnabled) {
      const cfResources = this.serverless.service.provider.compiledCloudFormationTemplate.Resources;
      for (const functionName of this.serverless.service.getAllFunctions()) {
        const functionConfig = this.serverless.service.getFunction(functionName);
        if (!this.console.isFunctionSupported(functionConfig)) continue;
        const functionLogicalId = this.provider.naming.getLambdaLogicalId(functionName);
        const functionResource = cfResources[functionLogicalId];
        if (!functionResource) continue; // Unexpected CF stack state, ignore
        const layers = functionResource.Properties.Layers;
        if (!layers || layers.length <= 5) continue;
        const nonConsoleLayers = layers.filter(
          (layer) => typeof layer !== 'string' || !layer.includes('layer:sls-otel-extension-')
        );
        throw new ServerlessError(
          `${
            `Cannot setup Serverless Console integration, as "${functionName}" function, ` +
            'has already maximum (5) number of layers referenced:\n  '
          }${nonConsoleLayers.map((layer) => JSON.stringify(layer)).join(',\n  ')}`,
          'TOO_MANY_LAYERS_TO_SETUP_CONSOLE'
        );
      }
    }
  },
};
