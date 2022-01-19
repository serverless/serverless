'use strict';

const filesize = require('../../../utils/filesize');
const { isVerboseMode, style } = require('@serverless/utils/log');

module.exports = {
  displayServiceInfo() {
    if (this.serverless.processedInput.commands.join(' ') === 'info') {
      this.serverless.serviceOutputs.set('service', this.serverless.service.service);
      this.serverless.serviceOutputs.set('stage', this.provider.getStage());
      this.serverless.serviceOutputs.set('region', this.provider.getRegion());
      this.serverless.serviceOutputs.set('stack', this.provider.naming.getStackName());
    }
  },

  displayApiKeys() {
    const conceal = this.options.conceal;
    const info = this.gatheredData.info;

    if (info.apiKeys && info.apiKeys.length > 0) {
      const outputSectionItems = [];
      info.apiKeys.forEach((apiKeyInfo) => {
        const description = apiKeyInfo.description ? ` - ${apiKeyInfo.description}` : '';
        if (conceal) {
          outputSectionItems.push(`${apiKeyInfo.name}${description}`);
        } else {
          outputSectionItems.push(`${apiKeyInfo.name}: ${apiKeyInfo.value}${description}`);
        }
      });
      this.serverless.serviceOutputs.set('api keys', outputSectionItems);
    }
  },

  displayEndpoints() {
    const info = this.gatheredData.info;
    const outputSectionItems = [];

    if (info.endpoints && info.endpoints.length) {
      info.endpoints.forEach((endpoint) => {
        // if the endpoint is of type http(s)
        if (endpoint.startsWith('https://')) {
          Object.values(this.serverless.service.functions).forEach((functionObject) => {
            functionObject.events.forEach((event) => {
              if (event.http) {
                let method;
                let path;

                if (typeof event.http === 'object') {
                  method = event.http.method.toUpperCase();
                  path = event.http.path;
                } else {
                  method = event.http.split(' ')[0].toUpperCase();
                  path = event.http.split(' ')[1];
                }
                path =
                  path !== '/'
                    ? `/${path
                        .split('/')
                        .filter((p) => p !== '')
                        .join('/')}`
                    : '';
                outputSectionItems.push(`${method} - ${endpoint}${path}`);
              }
            });
          });
        } else if (endpoint.startsWith('httpApi: ')) {
          endpoint = endpoint.slice('httpApi: '.length);
          const { httpApiEventsPlugin } = this.serverless;
          httpApiEventsPlugin.resolveConfiguration();

          for (const functionData of Object.values(this.serverless.service.functions)) {
            for (const event of functionData.events) {
              if (!event.httpApi) continue;
              outputSectionItems.push(
                `${event.resolvedMethod} - ${endpoint}${event.resolvedPath || ''}`
              );
            }
          }
        } else {
          // if the endpoint is not of type http(s) (e.g. wss) we just display
          outputSectionItems.push(endpoint);
        }
      });
    }

    if (info.cloudFront) {
      outputSectionItems.push(`CloudFront - ${info.cloudFront}`);
    }

    if (outputSectionItems.length > 1) {
      this.serverless.serviceOutputs.set('endpoints', outputSectionItems);
    } else if (outputSectionItems.length) {
      this.serverless.serviceOutputs.set('endpoint', outputSectionItems[0]);
    }
  },

  displayFunctions() {
    const info = this.gatheredData.info;

    if (info.functions && info.functions.length > 0) {
      const outputSectionItems = [];
      info.functions.forEach((f) => {
        outputSectionItems.push(
          `${f.name}: ${f.deployedName}${
            f.artifactSize ? style.aside(` (${filesize(f.artifactSize)})`) : ''
          }`
        );
      });
      this.serverless.serviceOutputs.set('functions', outputSectionItems);
    }
  },

  displayLayers() {
    const info = this.gatheredData.info;

    if (info.layers && info.layers.length > 0) {
      const outputSectionItems = [];
      info.layers.forEach((l) => {
        outputSectionItems.push(`${l.name}: ${l.arn}`);
      });
      this.serverless.serviceOutputs.set('layers', outputSectionItems);
    }
  },

  displayStackOutputs() {
    if (isVerboseMode && this.gatheredData.outputs.length) {
      const outputSectionItems = [];
      this.gatheredData.outputs.forEach((output) => {
        outputSectionItems.push(`${output.OutputKey}: ${output.OutputValue}`);
      });

      this.serverless.serviceOutputs.set('\nStack Outputs', outputSectionItems);
    }
  },
};
