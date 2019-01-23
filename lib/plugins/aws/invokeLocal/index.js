'use strict';

const BbPromise = require('bluebird');
const _ = require('lodash');
const os = require('os');
const fs = BbPromise.promisifyAll(require('fs'));
const path = require('path');
const validate = require('../lib/validate');
const chalk = require('chalk');
const stdin = require('get-stdin');
const spawn = require('child_process').spawn;
const inspect = require('util').inspect;

class AwsInvokeLocal {
  constructor(serverless, options) {
    this.serverless = serverless;
    this.options = options || {};
    this.provider = this.serverless.getProvider('aws');

    Object.assign(this, validate);

    this.hooks = {
      'before:invoke:local:loadEnvVars': () => BbPromise.bind(this)
        .then(this.extendedValidate)
        .then(this.loadEnvVars),
      'invoke:local:invoke': () => BbPromise.bind(this)
        .then(this.invokeLocal),
    };
  }

  validateFile(filePath, key) {
    const absolutePath = path.isAbsolute(filePath) ?
      filePath :
      path.join(this.serverless.config.servicePath, filePath);
    if (!this.serverless.utils.fileExistsSync(absolutePath)) {
      throw new this.serverless.classes.Error('The file you provided does not exist.');
    }

    if (absolutePath.endsWith('.js')) {
      // to support js - export as an input data
      this.options[key] = require(absolutePath); // eslint-disable-line global-require
    } else {
      this.options[key] = this.serverless.utils.readFileSync(absolutePath);
    }
  }

  extendedValidate() {
    this.validate();

    // validate function exists in service
    this.options.functionObj = this.serverless.service.getFunction(this.options.function);
    this.options.data = this.options.data || '';

    return new BbPromise(resolve => {
      if (this.options.contextPath) {
        this.validateFile(this.options.contextPath, 'context');
      }

      if (this.options.data) {
        resolve();
      } else if (this.options.path) {
        this.validateFile(this.options.path, 'data');

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
        // unless asked to preserve raw input, attempt to parse any provided objects
        if (!this.options.raw) {
          if (this.options.data) {
            this.options.data = JSON.parse(this.options.data);
          }
          if (this.options.context) {
            this.options.context = JSON.parse(this.options.context);
          }
        }
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
      LANG: 'en_US.UTF-8',
      LD_LIBRARY_PATH: '/usr/local/lib64/node-v4.3.x/lib:/lib64:/usr/lib64:/var/runtime:/var/runtime/lib:/var/task:/var/task/lib', // eslint-disable-line max-len
      LAMBDA_TASK_ROOT: '/var/task',
      LAMBDA_RUNTIME_DIR: '/var/runtime',
      AWS_REGION: this.provider.getRegion(),
      AWS_DEFAULT_REGION: this.provider.getRegion(),
      AWS_LAMBDA_LOG_GROUP_NAME: this.provider.naming.getLogGroupName(lambdaName),
      AWS_LAMBDA_LOG_STREAM_NAME: '2016/12/02/[$LATEST]f77ff5e4026c45bda9a9ebcec6bc9cad',
      AWS_LAMBDA_FUNCTION_NAME: lambdaName,
      AWS_LAMBDA_FUNCTION_MEMORY_SIZE: memorySize,
      AWS_LAMBDA_FUNCTION_VERSION: '$LATEST',
      NODE_PATH: '/var/runtime:/var/task:/var/runtime/node_modules',
    };

    // profile override from config
    const profileOverride = this.provider.getProfile();
    if (profileOverride) {
      lambdaDefaultEnvVars.AWS_PROFILE = profileOverride;
    }

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

    if (runtime.startsWith('nodejs')) {
      const handlerPath = handler.split('.')[0];
      const handlerName = handler.split('.')[1];
      return this.invokeLocalNodeJs(
        handlerPath,
        handlerName,
        this.options.data,
        this.options.context);
    }

    if (_.includes(['python2.7', 'python3.6', 'python3.7'], runtime)) {
      const handlerComponents = handler.split(/\./);
      const handlerPath = handlerComponents.slice(0, -1).join('.');
      const handlerName = handlerComponents.pop();
      return this.invokeLocalPython(
        process.platform === 'win32' ? 'python.exe' : runtime,
        handlerPath,
        handlerName,
        this.options.data,
        this.options.context);
    }

    if (runtime === 'java8') {
      const className = handler.split('::')[0];
      const handlerName = handler.split('::')[1] || 'handleRequest';
      return this.invokeLocalJava(
        'java',
        className,
        handlerName,
        this.serverless.service.package.artifact,
        this.options.data,
        this.options.context);
    }

    if (runtime === 'ruby2.5') {
      const handlerComponents = handler.split(/\./);
      const handlerPath = handlerComponents[0];
      const handlerName = handlerComponents.slice(1).join('.');
      return this.invokeLocalRuby(
        process.platform === 'win32' ? 'ruby.exe' : 'ruby',
        handlerPath,
        handlerName,
        this.options.data,
        this.options.context);
    }

    throw new this.serverless.classes
      .Error('You can only invoke Node.js, Python, Java & Ruby functions locally.');
  }

  invokeLocalPython(runtime, handlerPath, handlerName, event, context) {
    const input = JSON.stringify({
      event: event || {},
      context,
    });

    if (process.env.VIRTUAL_ENV) {
      const runtimeDir = os.platform() === 'win32' ? 'Scripts' : 'bin';
      process.env.PATH = [
        path.join(process.env.VIRTUAL_ENV, runtimeDir),
        path.delimiter,
        process.env.PATH,
      ].join('');
    }

    return new BbPromise(resolve => {
      const python = spawn(runtime.split('.')[0],
        ['-u', path.join(__dirname, 'invoke.py'), handlerPath, handlerName],
        { env: process.env }, { shell: true });
      python.stdout.on('data', (buf) => this.serverless.cli.consoleLog(buf.toString()));
      python.stderr.on('data', (buf) => this.serverless.cli.consoleLog(buf.toString()));
      python.stdin.write(input);
      python.stdin.end();
      python.on('close', () => resolve());
    });
  }

  callJavaBridge(artifactPath, className, handlerName, input) {
    return new BbPromise((resolve) => fs.statAsync(artifactPath).then(() => {
      const java = spawn('java', [
        `-DartifactPath=${artifactPath}`,
        `-DclassName=${className}`,
        `-DhandlerName=${handlerName}`,
        '-jar',
        path.join(__dirname, 'java', 'target', 'invoke-bridge-1.0.jar'),
      ], { shell: true });

      this.serverless.cli.log([
        'In order to get human-readable output,',
        ' please implement "toString()" method of your "ApiGatewayResponse" object.',
      ].join(''));

      java.stdout.on('data', (buf) => this.serverless.cli.consoleLog(buf.toString()));
      java.stderr.on('data', (buf) => this.serverless.cli.consoleLog(buf.toString()));
      java.stdin.write(input);
      java.stdin.end();
      java.on('close', () => resolve());
    }).catch(() => {
      throw new Error(`Artifact ${artifactPath} doesn't exists, please compile it first.`);
    }));
  }

  invokeLocalJava(runtime, className, handlerName, artifactPath, event, customContext) {
    const timeout = Number(this.options.functionObj.timeout)
      || Number(this.serverless.service.provider.timeout)
      || 6;
    const context = {
      name: this.options.functionObj.name,
      version: 'LATEST',
      logGroupName: this.provider.naming.getLogGroupName(this.options.functionObj.name),
      timeout,
    };
    const input = JSON.stringify({
      event: event || {},
      context: customContext || context,
    });

    const javaBridgePath = path.join(__dirname, 'java');
    const executablePath = path.join(javaBridgePath, 'target');

    return new BbPromise(resolve => fs.statAsync(executablePath)
      .then(() => this.callJavaBridge(artifactPath, className, handlerName, input))
      .then(resolve)
      .catch(() => {
        const mvn = spawn('mvn', [
          'package',
          '-f',
          path.join(javaBridgePath, 'pom.xml'),
        ], { shell: true });

        this.serverless.cli
          .log('Building Java bridge, first invocation might take a bit longer.');

        mvn.stderr.on('data', (buf) => this.serverless.cli.consoleLog(`mvn - ${buf.toString()}`));
        mvn.stdin.end();

        mvn.on('close', () => this.callJavaBridge(artifactPath, className, handlerName, input)
          .then(resolve));
      }));
  }

  invokeLocalRuby(runtime, handlerPath, handlerName, event, context) {
    const input = JSON.stringify({
      event: event || {},
      context,
    });

    return new BbPromise(resolve => {
      const ruby = spawn(runtime,
        [path.join(__dirname, 'invoke.rb'), handlerPath, handlerName],
        { env: process.env }, { shell: true });
      ruby.stdout.on('data', (buf) => this.serverless.cli.consoleLog(buf.toString()));
      ruby.stderr.on('data', (buf) => this.serverless.cli.consoleLog(buf.toString()));
      ruby.stdin.write(input);
      ruby.stdin.end();
      ruby.on('close', () => resolve());
    });
  }

  invokeLocalNodeJs(handlerPath, handlerName, event, customContext) {
    let lambda;
    let pathToHandler;
    let hasResponded = false;
    try {
      /*
       * we need require() here to load the handler from the file system
       * which the user has to supply by passing the function name
       */
      pathToHandler = path.join(
        this.serverless.config.servicePath,
        this.options.extraServicePath || '',
        handlerPath
      );
      const handlersContainer = require( // eslint-disable-line global-require
        pathToHandler
      );
      lambda = handlersContainer[handlerName];
    } catch (error) {
      this.serverless.cli.consoleLog(chalk.red(inspect(error)));
      throw new Error(`Exception encountered when loading ${pathToHandler}`);
    }

    function handleError(err) {
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
    }

    function handleResult(result) {
      if (result instanceof Error) {
        handleError.call(this, result);
        return;
      } else if (result.headers && result.headers['Content-Type'] === 'application/json') {
        if (result.body) {
          try {
            Object.assign(result, {
              body: JSON.parse(result.body),
            });
          } catch (e) {
            throw new Error('Content-Type of response is application/json but body is not json');
          }
        }
      }

      this.serverless.cli.consoleLog(JSON.stringify(result, null, 4));
    }

    return new Promise((resolve) => {
      const callback = (err, result) => {
        if (!hasResponded) {
          hasResponded = true;
          if (err) {
            handleError.call(this, err);
          } else if (result) {
            handleResult.call(this, result);
          }
        }
        resolve();
      };

      const startTime = new Date();
      const timeout = Number(this.options.functionObj.timeout)
        || Number(this.serverless.service.provider.timeout)
        || 6;
      let context = {
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
        done(error, result) {
          return callback(error, result);
        },
        getRemainingTimeInMillis() {
          return Math.max((timeout * 1000) - ((new Date()).valueOf() - startTime.valueOf()), 0);
        },
      };

      if (customContext) {
        context = customContext;
      }

      const maybeThennable = lambda(event, context, callback);
      if (!_.isUndefined(maybeThennable)) {
        return Promise.resolve(maybeThennable)
          .then(
            callback.bind(this, null),
            callback.bind(this)
          );
      }

      return maybeThennable;
    });
  }
}

module.exports = AwsInvokeLocal;
