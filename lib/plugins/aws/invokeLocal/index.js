'use strict';

const BbPromise = require('bluebird');
const _ = require('lodash');
const path = require('path');
const validate = require('../lib/validate');
const chalk = require('chalk');
const stdin = require('get-stdin');
const spawn = require('child_process').spawn;


class AwsInvokeLocal {
  constructor(serverless, options) {
    this.serverless = serverless;
    this.options = options || {};
    this.provider = this.serverless.getProvider('aws');

    Object.assign(this, validate);

    this.hooks = {
      'invoke:local:invoke': () => BbPromise.bind(this)
        .then(this.extendedValidate)
        .then(this.loadEnvVars)
        .then(this.invokeLocal),
    };
  }

  extendedValidate() {
    this.validate();

    // validate function exists in service
    this.options.functionObj = this.serverless.service.getFunction(this.options.function);
    this.options.data = this.options.data || '';

    return new BbPromise(resolve => {
      if (this.options.data) {
        resolve();
      } else if (this.options.path) {
        const absolutePath = path.isAbsolute(this.options.path) ?
          this.options.path :
          path.join(this.serverless.config.servicePath, this.options.path);
        if (!this.serverless.utils.fileExistsSync(absolutePath)) {
          throw new this.serverless.classes.Error('The file you provided does not exist.');
        }
        this.options.data = this.serverless.utils.readFileSync(absolutePath);
        resolve();
      } else {
        try {
          stdin().then(input => {
            this.options.data = input;
            resolve();
          });
        } catch (exception) {
          // resolve if no stdin was provided
          resolve();
        }
      }
    }).then(() => {
      try {
        this.options.data = JSON.parse(this.options.data);
      } catch (exception) {
        // do nothing if it's a simple string or object already
      }
    });
  }

  loadEnvVars() {
    const lambdaName = this.options.functionObj.name;
    const memorySize = Number(this.options.functionObj.memorySize)
      || Number(this.serverless.service.provider.memorySize)
      || 1024;

    const lambdaDefaultEnvVars = {
      PATH: '/usr/local/lib64/node-v4.3.x/bin:/usr/local/bin:/usr/bin/:/bin',
      LANG: 'en_US.UTF-8',
      LD_LIBRARY_PATH: '/usr/local/lib64/node-v4.3.x/lib:/lib64:/usr/lib64:/var/runtime:/var/runtime/lib:/var/task:/var/task/lib', // eslint-disable-line max-len
      LAMBDA_TASK_ROOT: '/var/task',
      LAMBDA_RUNTIME_DIR: '/var/runtime',
      AWS_REGION: this.options.region,
      AWS_DEFAULT_REGION: this.options.region,
      AWS_LAMBDA_LOG_GROUP_NAME: this.provider.naming.getLogGroupName(lambdaName),
      AWS_LAMBDA_LOG_STREAM_NAME: '2016/12/02/[$LATEST]f77ff5e4026c45bda9a9ebcec6bc9cad',
      AWS_LAMBDA_FUNCTION_NAME: lambdaName,
      AWS_LAMBDA_FUNCTION_MEMORY_SIZE: memorySize,
      AWS_LAMBDA_FUNCTION_VERSION: '$LATEST',
      NODE_PATH: '/var/runtime:/var/task:/var/runtime/node_modules',
    };

    const providerEnvVars = this.serverless.service.provider.environment || {};
    const functionEnvVars = this.options.functionObj.environment || {};

    _.merge(process.env, lambdaDefaultEnvVars, providerEnvVars, functionEnvVars);

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

    if (runtime === 'python2.7') {
      return this.invokeLocalPython(
        handlerPath,
        handlerName,
        this.options.data);
    }

    throw new this.serverless.classes
      .Error('You can only invoke Node.js & Python functions locally.');
  }

  invokeLocalPython(handlerPath, handlerName, event) {
    return new BbPromise(resolve => {
      const python = spawn(
        path.join(__dirname, 'invoke.py'), [handlerPath, handlerName], { env: process.env });
      python.stdout.on('data', (buf) => this.serverless.cli.consoleLog(buf.toString()));
      python.stderr.on('data', (buf) => this.serverless.cli.consoleLog(buf.toString()));
      python.stdin.write(JSON.stringify(event || {}));
      python.stdin.end();
      python.on('close', () => resolve());
    });
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
        let errorResult;
        if (err instanceof Error) {
          errorResult = {
            errorMessage: err.message,
            errorType: err.constructor.name,
          };
        } else {
          errorResult = {
            errorMessage: err,
          };
        }

        this.serverless.cli.consoleLog(chalk.red(JSON.stringify(errorResult, null, 4)));
        process.exitCode = 1;
      } else if (result) {
        this.serverless.cli.consoleLog(JSON.stringify(result, null, 4));
      }
    };

    const context = {
      awsRequestId: 'id',
      invokeid: 'id',
      logGroupName: this.provider.naming.getLogGroupName(this.options.functionObj.name),
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
