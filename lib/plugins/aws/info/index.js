'use strict';

const BbPromise = require('bluebird');
const validate = require('../lib/validate');
const SDK = require('../');
const chalk = require('chalk');

class AwsInfo {
  constructor(serverless, options) {
    this.serverless = serverless;
    this.options = options || {};
    this.provider = 'aws';
    this.sdk = new SDK(serverless);
    Object.assign(this, validate);

    this.hooks = {
      'info:info': () => BbPromise.bind(this)
          .then(this.validate)
          .then(this.gather)
          .then(this.display),

      'deploy:deploy': () => BbPromise.bind(this)
          .then(this.validate)
          .then(this.gather)
          .then(this.display),
    };
  }

  /**
   * Gather information about the service
   */
  gather() {
    const stackName = this.sdk.getStackName(this.options.stage);
    const info = {
      service: this.serverless.service.service,
      stage: this.options.stage,
      region: this.options.region,
    };

		// Get info from CLF Outputs

    return this.sdk.request('CloudFormation',
      'describeStacks',
      { StackName: stackName },
      this.options.stage,
      this.options.region)
    .then((result) => {
      if (result) {
        const outputs = result.Stacks[0].Outputs;

        // Functions
        info.functions = [];
        outputs.filter(x => x.OutputKey.match(/^Function\d+Arn$/))
          .forEach(x => {
            const functionInfo = {};
            functionInfo.arn = x.OutputValue;
            functionInfo.name = functionInfo.arn.substring(x.OutputValue.lastIndexOf(':') + 1);
            info.functions.push(functionInfo);
          });

        // Endpoints
        info.endpoints = [];
        outputs.filter(x => x.OutputKey.match(/^Endpoint\d+$/))
          .forEach(x => {
            const endpointInfo = { endpoint: x.OutputValue };
            info.endpoints.push(endpointInfo);
          });

        // Resources
        info.resources = [];
      }

      return BbPromise.resolve(info);
    })
    .catch((e) => {
      let result;

      if (e.code === 'ValidationError') {
        // stack doesn't exist, provide only the general info
        result = BbPromise.resolve(info);
      } else {
        // other aws sdk errors
        result = BbPromise.reject(new this.serverless.classes
          .Error(e.message));
      }

      return result;
    });
  }

  /**
   * Display service information
   */
  display(info) {
    let message = `
${chalk.yellow.underline('Service Information')}
${chalk.yellow('service:')} ${info.service}
${chalk.yellow('stage:')} ${info.stage}
${chalk.yellow('region:')} ${info.region}`;

    let endpointsMessage = `\n${chalk.yellow('endpoints:')}`;

    if (info.endpoints && info.endpoints.length > 0) {
      info.endpoints.forEach((e) => {
        endpointsMessage = endpointsMessage.concat(`\n  ${e.endpoint}`);
      });
    } else {
      endpointsMessage = endpointsMessage.concat(`\n  None`);
    }

    message = message.concat(endpointsMessage);

    let functionsMessage = `\n${chalk.yellow('functions:')}`;

    if (info.functions && info.functions.length > 0) {
      info.functions.forEach((f) => {
        functionsMessage = functionsMessage.concat(`\n  ${f.name}: ${f.arn}`);
      });
    } else {
      functionsMessage = functionsMessage.concat(`\n  None`);
    }

    message = message.concat(`${functionsMessage}\n`);

    this.serverless.cli.consoleLog(message);
    return message;
  }
}

module.exports = AwsInfo;
