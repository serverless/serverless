'use strict';

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
    this.serverless.service.resources.openwhisk = {
      functions: {}
    };
  }


  readFunctionSource(functionHandler) {
  }

  compileFunction(functionName, functionObject) {
    const code = readFunctionSource(functionHandler)
    const newFunction = {
      name: functionName,
      nameSpace: "",
      action: {
        exec: { kind: 'nodejs', code: code} 
      }
    }

    return newFunction
  }

  compileFunctions() {
    if (!this.serverless.service.resources.openwhisk || !this.serverless.service.resources.openwhisk.functions) {
      throw new this.serverless.classes.Error(
        'This plugin needs access to the Resources section of the OpenWhisk Resource Manager template');
    }

    this.serverless.service.getAllFunctions().forEach((functionName) => {
      const functionObject = this.serverless.service.getFunction(functionName);
      const newFunction = compileFunction(functionName, functionObject);

      /**
      // Can only do this if we have an openwhisk config.
      if (!functionObject.events.openwhisk) {
        throw new this.serverless.classes.Error(
          `Function ${functionName} does not have an openwhisk trigger configuration`
        );
      }*/

      this.serverless.service.resources.openwhisk.functions[functionName] = newFunction;
    });
  }
}

module.exports = OpenWhiskCompileFunctions;
