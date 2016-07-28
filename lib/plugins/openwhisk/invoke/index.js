'use strict';

const BbPromise = require('bluebird');
const chalk = require('chalk');
const path = require('path');
const ClientFactory = require('../util/client_factory');

const CmdLineParamsOptions = {
  type: ['blocking', 'nonblocking'],
  log: ['result', 'response'],
};

class OpenWhiskInvoke {
  constructor(serverless, options) {
    this.serverless = serverless;
    this.options = options || {};

    this.hooks = {
      'invoke:invoke': () => BbPromise.bind(this)
        .then(this.validate)
        .then(this.invoke)
        .then(this.log),
    };
  }

  validate() {
    if (!this.serverless.config.servicePath) {
      throw new this.serverless.classes.Error('This command can only be run inside a service.');
    }

    this.serverless.service.getFunction(this.options.function);

    if (this.options.path) {
      if (!this.serverless.utils
          .fileExistsSync(path.join(this.serverless.config.servicePath, this.options.path))) {
        throw new this.serverless.classes.Error('The file path you provided does not exist.');
      }

      this.options.data = this.serverless.utils
        .readFileSync(path.join(this.serverless.config.servicePath, this.options.path));

      if (this.options.data instanceof Buffer) {
        throw new this.serverless.classes.Error(
          'The file path provided must point to a .json file.'
        );
      }
    }

    this.validateParamOptions();

    return ClientFactory.fromWskProps().then(client => {
      this.client = client;
    });
  }

  // ensure command-line parameter values is a valid option.
  validateParamOptions() {
    Object.keys(CmdLineParamsOptions).forEach(key => {
      if (!this.options[key]) {
        this.options[key] = CmdLineParamsOptions[key][0];
      } else if (!CmdLineParamsOptions[key].find(i => i === this.options[key])) {
        const options = CmdLineParamsOptions[key].join(' or ');
        throw new this.serverless.classes.Error(
          `Invalid ${key} parameter value, must be either ${options}.`
        );
      }
    });
  }

  invoke() {
    const functionObject = this.serverless.service.getFunction(this.options.function);

    const options = {
      blocking: this.isBlocking(),
      actionName: functionObject.name
        || `${this.serverless.service.service}_${this.options.function}`,
    };

    if (functionObject.namespace) {
      options.namespace = functionObject.namespace;
    }

    if (this.options.data) {
      options.params = this.options.data;
    }

    return this.client.actions.invoke(options)
      .catch(err => {
        throw new this.serverless.classes.Error(
          `Failed to invoke function service (${this.options.function}) due to error:`
          + ` ${err.message}`
        );
      });
  }

  isBlocking() {
    return this.options.type === 'blocking';
  }

  isLogResult() {
    return this.options.log === 'result';
  }

  log(invocationReply) {
    let color = 'white';

    // error response indicated in-blocking call boolean parameter, success.
    if (this.isBlocking() && !invocationReply.response.success) {
      color = 'red';
    }

    let result = invocationReply;

    // blocking invocation result available as 'response.result' parameter
    if (this.isBlocking() && this.isLogResult()) {
      result = invocationReply.response.result;
    }

    this.consoleLog(chalk[color](JSON.stringify(result, null, 4)));
    return BbPromise.resolve();
  }

  consoleLog(msg) {
    console.log(msg); // eslint-disable-line no-console
  }
}

module.exports = OpenWhiskInvoke;
