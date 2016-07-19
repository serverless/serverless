'use strict';

const fs = require('fs-extra');
const BbPromise = require('bluebird');

class OpenWhiskCompileFunctions {
  constructor(serverless, options) {
    this.serverless = serverless;
    this.options = options;

    this.hooks = {
      'before:deploy:compileFunctions': this.setup.bind(this),
      'deploy:compileFunctions': this.compileFunctions.bind(this),
    };
  }

  setup() {
    // We'll keep the function JSON around in a map to be written to the
    // function folder as a 'function.json' file before deploying.
    this.serverless.service.resources.openwhisk.functions = {};
  }

  convertHandlerToPath(functionHandler) {
    return functionHandler.replace(/\..*$/, '.js');
  }

  readFunctionSource(functionHandler) {
    const handlerFile = this.convertHandlerToPath(functionHandler);
    const readFile = BbPromise.promisify(fs.readFile);
    return readFile(handlerFile, 'utf8');
  }

  compileFunction(functionName, functionObject) {
    return this.readFunctionSource(functionObject.handler).then(code => {
      const FunctionName = functionObject.name
        || `${this.serverless.service.service}_${functionName}`;
      const NameSpace = functionObject.namespace
        || `${this.serverless.service.resources.openwhisk.namespace}`;
      const MemorySize = functionObject.memory
        || this.serverless.service.defaults.memory
        || 256;
      const Timeout = functionObject.timeout
        || this.serverless.service.defaults.timeout
        || 60;
      const Runtime = functionObject.runtime
        || this.serverless.service.defaults.runtime
        || 'nodejs:default';
      const Rules = functionObject.events
        || {};

      let Overwrite = false;

      if (functionObject.hasOwnProperty('overwrite')) {
        Overwrite = functionObject.overwrite;
      } else if (this.serverless.service.defaults.hasOwnProperty('overwrite')) {
        Overwrite = this.serverless.service.defaults.overwrite;
      }

      const Parameters = Object.keys(functionObject.parameters || {})
        .map(key => ({ key, value: functionObject.parameters[key] }));

      const newFunction = {
        actionName: FunctionName,
        namespace: NameSpace,
        overwrite: Overwrite,
        rules: Rules,
        action: {
          exec: { kind: Runtime, code },
          limits: { timeout: Timeout * 1000, memory: MemorySize },
          parameters: Parameters,
        },
      };

      return newFunction;
    });
  }

  compileFunctions() {
    this.serverless.cli.log('Compiling Functions...');

    if (!this.serverless.service.resources.openwhisk ||
        !this.serverless.service.resources.openwhisk.functions) {
      throw new this.serverless.classes.Error(
        'Missing Resources section from OpenWhisk Resource Manager template');
    }

    const functionPromises = this.serverless.service.getAllFunctions().map((functionName) => {
      const functionObject = this.serverless.service.getFunction(functionName);

      if (!functionObject.handler) {
        throw new this.serverless.classes
          .Error(`Missing "handler" property in function ${functionName}`);
      }

      const functions = this.serverless.service.resources.openwhisk.functions;
      const err = () => {
        throw new this.serverless.classes
          .Error(`Unable to read handler file in function ${functionName}`);
      };

      return this.compileFunction(functionName, functionObject)
        .then(newFunction => (functions[functionName] = newFunction))
        .catch(err);
    });

    return BbPromise.all(functionPromises);
  }
}

module.exports = OpenWhiskCompileFunctions;
