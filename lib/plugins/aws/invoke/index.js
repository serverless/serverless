'use strict';

const BbPromise = require('bluebird');
const chalk = require('chalk');
const path = require('path');
const validate = require('../lib/validate');
const stdin = require('get-stdin');
const formatLambdaLogEvent = require('../utils/formatLambdaLogEvent');

class AwsInvoke {
  constructor(serverless, options) {
    this.serverless = serverless;
    this.options = options || {};
    this.provider = this.serverless.getProvider('aws');

    Object.assign(this, validate);

    this.hooks = {
      'invoke:invoke': () =>
        BbPromise.bind(this)
          .then(this.extendedValidate)
          .then(this.invoke)
          .then(this.log),
    };
  }

  async extendedValidate() {
    this.validate();
    // validate function exists in service
    this.options.functionObj = this.serverless.service.getFunction(this.options.function);
    this.options.data = this.options.data || '';

    if (!this.options.data) {
      if (this.options.path) {
        const absolutePath = path.isAbsolute(this.options.path)
          ? this.options.path
          : path.join(this.serverless.config.servicePath, this.options.path);
        if (!this.serverless.utils.fileExistsSync(absolutePath)) {
          throw new this.serverless.classes.Error('The file you provided does not exist.');
        }
        this.options.data = this.serverless.utils.readFileSync(absolutePath);
      } else {
        try {
          this.options.data = await stdin();
        } catch {
          // continue if no stdin was provided
        }
      }
    }

    try {
      if (!this.options.raw) {
        this.options.data = JSON.parse(this.options.data);
      }
    } catch (exception) {
      // do nothing if it's a simple string or object already
    }
  }

  invoke() {
    const invocationType = this.options.type || 'RequestResponse';
    if (invocationType !== 'RequestResponse') {
      this.options.log = 'None';
    } else {
      this.options.log = this.options.log ? 'Tail' : 'None';
    }

    const params = {
      FunctionName: this.options.functionObj.name,
      InvocationType: invocationType,
      LogType: this.options.log,
      Payload: Buffer.from(JSON.stringify(this.options.data || {})),
    };

    if (this.options.qualifier) {
      params.Qualifier = this.options.qualifier;
    }

    return this.provider.request('Lambda', 'invoke', params);
  }

  log(invocationReply) {
    const color = !invocationReply.FunctionError ? x => x : chalk.red;

    if (invocationReply.Payload) {
      const response = JSON.parse(invocationReply.Payload);

      this.consoleLog(color(JSON.stringify(response, null, 4)));
    }

    if (invocationReply.LogResult) {
      this.consoleLog(
        chalk.gray('--------------------------------------------------------------------')
      );
      const logResult = Buffer.from(invocationReply.LogResult, 'base64').toString();
      logResult.split('\n').forEach(line => this.consoleLog(formatLambdaLogEvent(line)));
    }

    if (invocationReply.FunctionError) {
      return BbPromise.reject(new Error('Invoked function failed'));
    }

    return BbPromise.resolve();
  }

  consoleLog(msg) {
    console.log(msg); // eslint-disable-line no-console
  }
}

module.exports = AwsInvoke;
