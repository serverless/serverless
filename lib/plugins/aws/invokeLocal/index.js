'use strict';

const BbPromise = require('bluebird');
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
      this.options.data = this.serverless.utils.readFileSync(absolutePath);
    }

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
        this.options.data);
    }

    throw new this.serverless.classes
      .Error('You can only invoke Node.js functions locally.');
  }

  invokeLocalNodeJs(handlerPath, handlerName, event) {
    let lambda;

    try {
      /*
       * we need require() here to load the handler from the file system
       * which the user has to supply by passing the function name
       */
      lambda = require(path // eslint-disable-line global-require
        .join(this.serverless.config.servicePath, handlerPath))[handlerName];
    } catch (error) {
      this.serverless.cli.consoleLog(error);
      process.exit(0);
    }

    const callback = (err, result) => {
      if (err) {
        throw err;
      } else {
        if (result) {
          this.serverless.cli.consoleLog(JSON.stringify(result, null, 4));
        }
        process.exit(0);
      }
    };

    const context = {
      awsRequestId: 'id',
      invokeid: 'id',
      logGroupName: `/aws/lambda/${this.options.functionObj.name}`,
      logStreamName: '2015/09/22/[HEAD]13370a84ca4ed8b77c427af260',
      functionVersion: 'HEAD',
      isDefaultFunctionVersion: true,

      functionName: this.options.functionObj.name,
      memoryLimitInMB: '1024',

      succeed(result) {
        return callback(null, result);
      },
      fail(error) {
        return callback(error);
      },
      done() {
        return callback();
      },
      getRemainingTimeInMillis() {
        return 5000;
      },
    };

    return lambda(event, context, callback);
  }
}

module.exports = AwsInvokeLocal;
