'use strict';

const chalk = require('chalk');
const { style, legacy, writeText, isVerboseMode } = require('@serverless/utils/log');

module.exports = {
  displayServiceInfo() {
    const info = this.gatheredData.info;

    let message = '';
    message += `${chalk.yellow.underline('Service Information')}\n`;
    message += `${chalk.yellow('service:')} ${info.service}\n`;
    message += `${chalk.yellow('stage:')} ${info.stage}\n`;
    message += `${chalk.yellow('region:')} ${info.region}\n`;
    message += `${chalk.yellow('stack:')} ${info.stack}\n`;
    message += `${chalk.yellow('resources:')} ${info.resourceCount}`;

    if (info.resourceCount >= 450) {
      message += `\n${chalk.red('WARNING:')}\n`;
      message += `  You have ${info.resourceCount} resources in your service.\n`;
      message += '  CloudFormation has a hard limit of 500 resources in a service.\n';
      message += '  For advice on avoiding this limit, check out this link: http://bit.ly/2IiYB38.';
    }

    legacy.consoleLog(message);
    return message;
  },

  displayApiKeys() {
    const conceal = this.options.conceal;
    const info = this.gatheredData.info;
    let apiKeysMessage = `${chalk.yellow('api keys:')}`;

    if (info.apiKeys && info.apiKeys.length > 0) {
      const outputSectionItems = [];
      info.apiKeys.forEach((apiKeyInfo) => {
        const description = apiKeyInfo.description ? ` - ${apiKeyInfo.description}` : '';
        if (conceal) {
          apiKeysMessage += `\n  ${apiKeyInfo.name}${description}`;
        } else {
          apiKeysMessage += `\n  ${apiKeyInfo.name}: ${apiKeyInfo.value}${description}`;
        }
        outputSectionItems.push(`${apiKeyInfo.name}: ${apiKeyInfo.value}${description}`);
      });
      this.serverless.addServiceOutputSection('api keys', outputSectionItems);
    } else {
      apiKeysMessage += '\n  None';
    }

    legacy.consoleLog(apiKeysMessage);
    return apiKeysMessage;
  },

  displayEndpoints() {
    const info = this.gatheredData.info;
    let endpointsMessage = `${chalk.yellow('endpoints:')}`;
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
                endpointsMessage += `\n  ${method} - ${endpoint}${path}`;
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
              endpointsMessage += `\n  ${event.resolvedMethod} - ${endpoint}${
                event.resolvedPath || ''
              }`;
              outputSectionItems.push(
                `${event.resolvedMethod} - ${endpoint}${event.resolvedPath || ''}`
              );
            }
          }
        } else {
          // if the endpoint is not of type http(s) (e.g. wss) we just display
          endpointsMessage += `\n  ${endpoint}`;
          outputSectionItems.push(endpoint);
        }
      });
    }

    if (info.cloudFront) {
      endpointsMessage += `\n  CloudFront - ${info.cloudFront}`;
      outputSectionItems.push(`CloudFront - ${info.cloudFront}`);
    }

    if (outputSectionItems.length > 1) {
      this.serverless.addServiceOutputSection('endpoints', outputSectionItems);
    } else if (outputSectionItems.length) {
      this.serverless.addServiceOutputSection('endpoint', outputSectionItems[0]);
    }
    legacy.consoleLog(endpointsMessage);
    return endpointsMessage;
  },

  displayFunctions() {
    const info = this.gatheredData.info;
    let functionsMessage = `${chalk.yellow('functions:')}`;

    if (info.functions && info.functions.length > 0) {
      const outputSectionItems = [];
      info.functions.forEach((f) => {
        functionsMessage += `\n  ${f.name}: ${f.deployedName}`;
        outputSectionItems.push(`${f.name}: ${f.deployedName}`);
      });
      this.serverless.addServiceOutputSection('functions', outputSectionItems);
    } else {
      functionsMessage += '\n  None';
    }

    legacy.consoleLog(functionsMessage);
    return functionsMessage;
  },

  displayLayers() {
    const info = this.gatheredData.info;
    let layersMessage = `${chalk.yellow('layers:')}`;

    if (info.layers && info.layers.length > 0) {
      const outputSectionItems = [];
      info.layers.forEach((l) => {
        layersMessage += `\n  ${l.name}: ${l.arn}`;
        outputSectionItems.push(`${l.name}: ${l.arn}`);
      });
      this.serverless.addServiceOutputSection('layers', outputSectionItems);
    } else {
      layersMessage += '\n  None';
    }

    legacy.consoleLog(layersMessage);
    return layersMessage;
  },

  displayStackOutputs() {
    let message = '';
    if (this.options.verbose) {
      message = `${chalk.yellow.underline('\nStack Outputs\n')}`;
      this.gatheredData.outputs.forEach((output) => {
        message += `${chalk.yellow(output.OutputKey)}: ${output.OutputValue}\n`;
      });

      legacy.consoleLog(message);
    }

    if (isVerboseMode && this.gatheredData.outputs.length) {
      const outputSectionItems = [];
      this.gatheredData.outputs.forEach((output) => {
        outputSectionItems.push(`${output.OutputKey}: ${output.OutputValue}`);
      });

      this.serverless.addServiceOutputSection('\nStack Outputs', outputSectionItems);
    }

    return message;
  },

  displayServiceOutputs() {
    if (this.serverless.serviceOutputs && !this.serverless.service.provider.shouldNotDeploy) {
      for (const [section, entries] of this.serverless.serviceOutputs) {
        if (typeof entries === 'string') {
          writeText(`${style.aside(`${section}:`)} ${entries}`);
        } else {
          writeText(`${style.aside(`${section}:\n`)}  ${entries.join('\n  ')}`);
        }
      }
    }
  },
};
