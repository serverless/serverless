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
    // This object will be used to store the Action resources, passed directly to
    // the OpenWhisk SDK during the deploy process.
    this.serverless.service.actions = {};
  }

  convertHandlerToPath(functionHandler) {
    return functionHandler.replace(/\..*$/, '.js');
  }

  readFunctionSource(functionHandler) {
    const handlerFile = this.convertHandlerToPath(functionHandler);
    const readFile = BbPromise.promisify(fs.readFile);
    return readFile(handlerFile, 'utf8');
  }

  compileRules(functionName, nameSpace, rules) {
    return rules.reduce((prev, rule) => {
      const ruleName = Object.keys(rule)[0];
      prev[ruleName] = { // eslint-disable-line no-param-reassign
        ruleName,
        action: functionName,
        namespace: nameSpace,
        trigger: rule[ruleName],
        overwrite: true,
      };
      return prev;
    }, {});
  }

  calculateFunctionName(functionName, functionObject) {
    return functionObject.name || `${this.serverless.service.service}_${functionName}`;
  }

  calculateFunctionNameSpace(functionName, functionObject) {
    return functionObject.namespace
      || this.serverless.service.provider.namespace
      || this.serverless.service.defaults.namespace;
  }

  calculateMemorySize(functionObject) {
    return functionObject.memory || this.serverless.service.provider.memory || 256;
  }

  calculateTimeout(functionObject) {
    return functionObject.timeout || this.serverless.service.provider.timeout || 60;
  }

  calculateRuntime(functionObject) {
    return functionObject.runtime || this.serverless.service.provider.runtime || 'nodejs';
  }

  calculateOverwrite(functionObject) {
    let Overwrite = true;

    if (functionObject.hasOwnProperty('overwrite')) {
      Overwrite = functionObject.overwrite;
    } else if (this.serverless.service.provider.hasOwnProperty('overwrite')) {
      Overwrite = this.serverless.service.provider.overwrite;
    }

    return Overwrite;
  }

  compileFunctionAction(params) {
    return {
      actionName: params.FunctionName,
      namespace: params.NameSpace,
      overwrite: params.Overwrite,
      rules: params.Rules,
      action: {
        exec: { kind: params.Runtime, code: params.code },
        limits: { timeout: params.Timeout * 1000, memory: params.MemorySize },
        parameters: params.Parameters,
      },
    };
  }

  // This method takes the function handler definition, parsed from the user's YAML file,
  // and turns it into the OpenWhisk Action resource object.
  //
  // These resource objects are passed to the OpenWhisk SDK to create the associated Actions
  // during the deployment process.
  //
  // Parameter values will be parsed from the user's YAML definition, either as a value from
  // the function handler definition or the service provider defaults.
  compileFunction(functionName, functionObject) {
    return this.readFunctionSource(functionObject.handler).then(code => {
      const FunctionName = this.calculateFunctionName(functionName, functionObject);
      const NameSpace = this.calculateFunctionNameSpace(functionName, functionObject);
      const MemorySize = this.calculateMemorySize(functionObject);
      const Timeout = this.calculateTimeout(functionObject);
      const Runtime = this.calculateRuntime(functionObject);
      const Overwrite = this.calculateOverwrite(functionObject);

      // optional rules parameter
      const Rules = this.compileRules(FunctionName, NameSpace, functionObject.events || []);

      // optional action parameters
      const Parameters = Object.keys(functionObject.parameters || {})
        .map(key => ({ key, value: functionObject.parameters[key] }));

      return this.compileFunctionAction(
        { FunctionName, NameSpace, Overwrite, Rules,
          Runtime, code, Timeout, MemorySize, Parameters }
      );
    });
  }

  compileFunctions() {
    this.serverless.cli.log('Compiling Functions...');

    if (!this.serverless.service.actions) {
      throw new this.serverless.classes.Error(
        'Missing Resources section from OpenWhisk Resource Manager template');
    }

    const functionPromises = this.serverless.service.getAllFunctions().map((functionName) => {
      const functionObject = this.serverless.service.getFunction(functionName);

      if (!functionObject.handler) {
        throw new this.serverless.classes
          .Error(`Missing "handler" property in function ${functionName}`);
      }

      const functions = this.serverless.service.actions;
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
