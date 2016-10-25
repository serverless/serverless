'use strict';

const BbPromise = require('bluebird');
const chalk = require('chalk');
const path = require('path');
const validate = require('../lib/validate');

class AwsInvokeLocal {
  constructor(serverless, options) {
    this.serverless = serverless;
    this.options = options || {};
    this.provider = this.serverless.getProvider('aws');

    Object.assign(this, validate);

    this.hooks = {
      'invoke:local:invoke': () => BbPromise.bind(this)
        .then(this.extendedValidate)
        .then(this.invokeLocal),
    };
  }

  extendedValidate() {
    this.validate();

    // validate function exists in service
    this.options.functionObj = this.serverless.service.getFunction(this.options.function);

    if (this.options.path) {
      const absolutePath = path.isAbsolute(this.options.path) ?
        this.options.path :
        path.join(this.serverless.config.servicePath, this.options.path);
      if (!this.serverless.utils.fileExistsSync(absolutePath)) {
        throw new this.serverless.classes.Error('The file you provided does not exist.');
      }
      const mockFile = this.serverless.utils.readFileSync(absolutePath);
      if (!mockFile.event && !this.options.data) {
        this.consoleLog('Event data not set. Passing empty event...');
      } else {
        this.options.data = this.serverless.utils.readFileSync(absolutePath).event;
      }

      if (!mockFile.context) {
        this.consoleLog('Context mock not set. Passing empty context...');
      } else {
        this.options.context = this.serverless.utils.readFileSync(absolutePath).context;
      }
    }

    this.options.data = this.options.data || {};
    this.options.context = this.options.context || {};

    return BbPromise.resolve();
  }

  invokeLocal() {
    const runtime = this.options.functionObj.runtime
      || this.serverless.service.provider.runtime
      || 'nodejs4.3';
    const handler = this.options.functionObj.handler;
    const handlerPath = handler.split('.')[0];
    const handlerName = handler.split('.')[1];

    if (runtime === 'nodejs4.3') {
      return this.invokeLocalNodeJs(
        handlerPath,
        handlerName,
        this.options.data,
        this.options.context);
    }

    throw new this.serverless.classes
      .Error('You can only invoke Node.js functions locally.');
  }

  invokeLocalNodeJs(handlerPath, handlerName, event, context) {
    const lambda = require(path // eslint-disable-line global-require
      .join(this.serverless.config.servicePath, handlerPath))[handlerName];
    const callback = (err, result) => {
      if (err) {
        throw err;
      } else {
        if (result) {
          this.consoleLog('');
          this.consoleLog(JSON.stringify(result, null, 4));
          this.consoleLog('');
        }
        process.exit(0);
      }
    };
    return lambda(event, context, callback);
  }

  consoleLog(msg) {
    console.log(chalk.yellow(msg)); // eslint-disable-line no-console
  }
}

module.exports = AwsInvokeLocal;
