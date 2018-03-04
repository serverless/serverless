'use strict';

const chalk = require('chalk');
const _ = require('lodash');

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

    if (_.has(info, 'resourceCount') && info.resourceCount >= 150) {
      message += `\n${chalk.red('WARNING:')}\n`;
      message += `  You have ${info.resourceCount} resources in your service.\n`;
      message += '  CloudFormation has a hard limit of 200 resources in a service.\n';
      message += '  For advice on avoiding this limit, check out this link: http://bit.ly/2IiYB38.';
    }

    this.serverless.cli.consoleLog(message);
    return message;
  },

  displayApiKeys() {
    const conceal = this.options.conceal;
    const info = this.gatheredData.info;
    let apiKeysMessage = `${chalk.yellow('api keys:')}`;

    if (info.apiKeys && info.apiKeys.length > 0) {
      info.apiKeys.forEach(apiKeyInfo => {
        const description = apiKeyInfo.description ? ` - ${apiKeyInfo.description}` : '';
        if (conceal) {
          apiKeysMessage += `\n  ${apiKeyInfo.name}${description}`;
        } else {
          apiKeysMessage += `\n  ${apiKeyInfo.name}: ${apiKeyInfo.value}${description}`;
        }
      });
    } else {
      apiKeysMessage += '\n  None';
    }

    this.serverless.cli.consoleLog(apiKeysMessage);
    return apiKeysMessage;
  },

  displayEndpoints() {
    const info = this.gatheredData.info;
    let endpointsMessage = `${chalk.yellow('endpoints:')}`;

    if (info.endpoints && info.endpoints.length) {
      _.forEach(info.endpoints, endpoint => {
        // if the endpoint is of type http(s)
        if (!endpoint.startsWith('wss://')) {
          _.forEach(this.serverless.service.functions, functionObject => {
            functionObject.events.forEach(event => {
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
                        .filter(p => p !== '')
                        .join('/')}`
                    : '';
                endpointsMessage += `\n  ${method} - ${endpoint}${path}`;
              }
            });
          });
        } else {
          // if the endpoint is not of type http(s) (e.g. wss) we just display
          endpointsMessage += `\n  ${endpoint}`;
        }
      });
    }

    if (info.cloudFront) {
      endpointsMessage += `\n  CloudFront - ${info.cloudFront}`;
    }

    if (!info.endpoints.length && !info.cloudFront) {
      endpointsMessage += '\n  None';
    }

    this.serverless.cli.consoleLog(endpointsMessage);
    return endpointsMessage;
  },

  displayFunctions() {
    const info = this.gatheredData.info;
    let functionsMessage = `${chalk.yellow('functions:')}`;

    if (info.functions && info.functions.length > 0) {
      info.functions.forEach(f => {
        functionsMessage += `\n  ${f.name}: ${f.deployedName}`;
      });
    } else {
      functionsMessage += '\n  None';
    }

    this.serverless.cli.consoleLog(functionsMessage);
    return functionsMessage;
  },

  displayLayers() {
    const info = this.gatheredData.info;
    let layersMessage = `${chalk.yellow('layers:')}`;

    if (info.layers && info.layers.length > 0) {
      info.layers.forEach(l => {
        layersMessage += `\n  ${l.name}: ${l.arn}`;
      });
    } else {
      layersMessage += '\n  None';
    }

    this.serverless.cli.consoleLog(layersMessage);
    return layersMessage;
  },

  displayStackOutputs() {
    let message = '';
    if (this.options.verbose) {
      message = `${chalk.yellow.underline('\nStack Outputs\n')}`;
      _.forEach(this.gatheredData.outputs, output => {
        message += `${chalk.yellow(output.OutputKey)}: ${output.OutputValue}\n`;
      });

      this.serverless.cli.consoleLog(message);
    }

    return message;
  },
};
