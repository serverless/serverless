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
    this.serverless.service.resources.openwhisk = {
      functions: {}
    };
  }

  convertHandlerToPath(functionHandler) {
    return functionHandler.replace(/\..*$/, '.js')
  }

  readFunctionSource(functionHandler) {
    const handlerFile = this.convertHandlerToPath(functionHandler)
    const readFile = BbPromise.promisify(fs.readFile);
    return readFile(handlerFile, 'utf8')
  }

  compileFunction(functionName, functionObject) {
    return this.readFunctionSource(functionObject.handler).then(code => {
      const newFunction = {
        name: functionName,
        nameSpace: "",
        action: {
          exec: { kind: 'nodejs', code: code} 
        }
      }

      return newFunction
    })
  }

  compileFunctions() {
    if (!this.serverless.service.resources.openwhisk || !this.serverless.service.resources.openwhisk.functions) {
      throw new this.serverless.classes.Error(
        'This plugin needs access to the Resources section of the OpenWhisk Resource Manager template');
    }

    const functionPromises = this.serverless.service.getAllFunctions().map((functionName) => {
      const functionObject = this.serverless.service.getFunction(functionName);

      if (!functionObject.handler) {
        throw new this.serverless.classes
          .Error(`Missing "handler" property in function ${functionName}`);
      }

      const functions = this.serverless.service.resources.openwhisk.functions
      const err = () => {
        throw new this.serverless.classes
          .Error(`Unable to read handler file in function ${functionName}`);
      }

      return this.compileFunction(functionName, functionObject)
        .then(newFunction => functions[functionName] = newFunction)
        .catch(err)
    });

    return BbPromise.all(functionPromises);
  }
}

module.exports = OpenWhiskCompileFunctions;
