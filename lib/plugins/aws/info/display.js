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
    message += `${chalk.yellow('stack:')} ${info.stack}`;

    this.serverless.cli.consoleLog(message);
    return message;
  },

  displayApiKeys() {
    const conceal = this.options.conceal;
    const info = this.gatheredData.info;
    let apiKeysMessage = `${chalk.yellow('api keys:')}`;

    if (info.apiKeys && info.apiKeys.length > 0) {
      info.apiKeys.forEach((apiKeyInfo) => {
        if (conceal) {
          apiKeysMessage += `\n  ${apiKeyInfo.name}`;
        } else {
          apiKeysMessage += `\n  ${apiKeyInfo.name}: ${apiKeyInfo.value}`;
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

    if (info.endpoint) {
      _.forEach(this.serverless.service.functions, (functionObject) => {
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
            path = path !== '/' ? `/${path.split('/').filter(p => p !== '').join('/')}` : '';
            endpointsMessage += `\n  ${method} - ${info.endpoint}${path}`;
          }
        });
      });
    } else {
      endpointsMessage += '\n  None';
    }

    this.serverless.cli.consoleLog(endpointsMessage);
    return endpointsMessage;
  },

  displayFunctions() {
    const info = this.gatheredData.info;
    let functionsMessage = `${chalk.yellow('functions:')}`;

    if (info.functions && info.functions.length > 0) {
      info.functions.forEach((f) => {
        functionsMessage += `\n  ${f.name}: ${f.deployedName}`;
      });
    } else {
      functionsMessage += '\n  None';
    }

    this.serverless.cli.consoleLog(functionsMessage);
    return functionsMessage;
  },

  displayStackOutputs() {
    let message = '';
    if (this.options.verbose) {
      message = `${chalk.yellow.underline('\nStack Outputs\n')}`;
      _.forEach(this.gatheredData.outputs, (output) => {
        message += `${chalk.yellow(output.OutputKey)}: ${output.OutputValue}\n`;
      });

      this.serverless.cli.consoleLog(message);
    }

    return message;
  },
};
