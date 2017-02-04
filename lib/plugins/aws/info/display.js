'use strict';

const chalk = require('chalk');
const _ = require('lodash');

module.exports = {
  display() {
    const info = this.gatheredData.info;

    let message = '';

    message += `${chalk.yellow.underline('Service Information')}\n`;
    message += `${chalk.yellow('service:')} ${info.service}\n`;
    message += `${chalk.yellow('stage:')} ${info.stage}\n`;
    message += `${chalk.yellow('region:')} ${info.region}`;

    // Display API Keys
    let apiKeysMessage = `\n${chalk.yellow('api keys:')}`;

    if (info.apiKeys && info.apiKeys.length > 0) {
      info.apiKeys.forEach((apiKeyInfo) => {
        apiKeysMessage += `\n  ${apiKeyInfo.name}: ${apiKeyInfo.value}`;
      });
    } else {
      apiKeysMessage += '\n  None';
    }

    message += apiKeysMessage;

    // Display Endpoints
    let endpointsMessage = `\n${chalk.yellow('endpoints:')}`;

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

    message += endpointsMessage;

    // Display function information
    let functionsMessage = `\n${chalk.yellow('functions:')}`;

    if (info.functions && info.functions.length > 0) {
      info.functions.forEach((f) => {
        functionsMessage += `\n  ${f.name}`;
      });
    } else {
      functionsMessage += '\n  None';
    }

    message += functionsMessage;

    // when verbose info is requested, add the stack outputs to the output
    if (this.options.verbose) {
      message += `${chalk.yellow.underline('\n\nStack Outputs\n')}`;
      _.forEach(this.gatheredData.outputs, (output) => {
        message += `${chalk.yellow(output.OutputKey)}: ${output.OutputValue}\n`;
      });
    }

    this.serverless.cli.consoleLog(message);
    return message;
  },
};
