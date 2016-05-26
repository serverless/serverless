'use strict';

const BbPromise = require('bluebird');
const forEach = require('lodash').forEach;
const merge = require('lodash').merge;
const path = require('path');

class AwsCompileFunctionsToResources {
  constructor(serverless) {
    this.serverless = serverless;

    // default properties
    this.functions = []; // extracted functions from the serverless.yaml file as JS objects
    this.functionResources = []; // AWS resource definitions for the functions
    this.cloudFormationResult = {};

    // TODO: remove because it relies on awsResourcesDeploy hooks
    this.commands = {
      compile: {
        commands: {
          functions: {
            usage: 'Compiles the function definition in serverless.yaml to a CloudFormation stack',
            lifecycleEvents: [
              'compile',
            ],
          },
        },
      },
    };

    this.hooks = {
      'compile:functions:compile': (options) => {
        this.options = options;
        return BbPromise.bind(this)
          .then(this.extractFunctions)
          .then(this.createFunctionResources)
          .then(this.addFunctionResourcesToCFMainTemplate)
          .catch((exception) => {
            throw new this.serverless.classes.Error(exception);
          });
      },
    };
  }

  extractFunctions() {
    const functions = this.serverless.service.functions;

    forEach(functions, (value, key) => {
      // check if it's the function and not the name_template property
      if (key !== 'name_template') {
        const functionObject = {
          [key]: value,
        };

        this.functions.push(functionObject);
      }
    });
    return BbPromise.resolve();
  }

  createFunctionResources() {
    const functionTemplate = this.serverless.utils.readFileSync(
      path.join(__dirname, 'templates', 'cf-function-template.json'));

    this.functions.forEach((func) => {
      const newFunction = functionTemplate;
      const functionName = Object.keys(func)[0];

      // TODO get the variables from the options or smth. like that
      const role = this.serverless.service.getVariables('dev', 'aws_useast1').iamRoleArnLambda;

      newFunction.Properties.Code = ''; // Code will be added later on!
      newFunction.Properties.FunctionName = functionName;
      newFunction.Properties.Handler = func[functionName].handler;
      newFunction.Properties.MemorySize =
        func[functionName].provider.aws_lambda.memorySize || 1024;
      newFunction.Properties.Role = role;
      newFunction.Properties.Runtime =
        func[functionName].provider.aws_lambda.runtime || 'nodejs4.3';
      newFunction.Properties.Timeout =
        func[functionName].provider.aws_lambda.timeout || 6;

      const functionResourceKey = `${functionName}Lambda`;

      const newFunctionObject = {
        [functionResourceKey]: newFunction,
      };

      this.functionResources.push(newFunctionObject);
    });
    return BbPromise.resolve();
  }

  addFunctionResourcesToCFMainTemplate() {
    const CFMainTemplate = this.serverless.utils.readFileSync(
      path.join(__dirname, 'templates', 'cf-main-template.json'));

    this.functionResources.forEach((functionResource) => {
      merge(CFMainTemplate.Resources, functionResource);
    });

    this.cloudFormationResult = CFMainTemplate;

    // TODO pass the result to awsResourcesDeploy plugin
    console.log(JSON.stringify(this.cloudFormationResult, null, 2));

    return BbPromise.resolve();
  }
}

module.exports = AwsCompileFunctionsToResources;
