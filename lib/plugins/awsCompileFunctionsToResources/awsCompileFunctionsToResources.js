'use strict';

const BbPromise = require('bluebird');
const path = require('path');
const forEach = require('lodash').forEach;
const merge = require('lodash').merge;

class AwsCompileFunctionsToResources {
  constructor(serverless) {
    this.serverless = serverless;

    // default properties
    this.options = {};
    this.functions = []; // extracted functions from the serverless.yaml file as JS objects
    this.functionResources = []; // AWS resource definitions for the functions

    this.hooks = {
      'before:resources:resources': this.run.bind(this),
    };
  }

  run(options) {
    this.options = options;
    return BbPromise.bind(this)
      .then(this.validateOptions)
      .then(this.extractFunctions)
      .then(this.createFunctionResources)
      .then(this.addFunctionResourcesToServiceResourcesObject)
      .catch((exception) => {
        throw new this.serverless.classes.Error(exception);
      });
  }

  validateOptions() {
    if (!this.options.stage) {
      throw new this.serverless.classes.Error('Please pass in a valid stage.');
    }

    if (!this.options.region) {
      throw new this.serverless.classes.Error('Please pass in a valid region');
    }

    BbPromise.resolve();
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
    const functionTemplate = `
      {
        "Type": "AWS::Lambda::Function",
        "Properties": {
        "Code": "Code",
        "FunctionName": "FunctionName",
          "Handler": "Handler",
          "MemorySize": "MemorySize",
          "Role": "Role",
          "Runtime": "Runtime",
          "Timeout": "Timeout"
        }
      }
    `;

    this.functions.forEach((func) => {
      const newFunction = JSON.parse(functionTemplate);
      const functionName = Object.keys(func)[0];

      const role = this.serverless.service.getVariables(
        this.options.stage,
        this.options.region
      ).iamRoleArnLambda;

      if (!functionName) {
        throw new this.serverless.classes.Error('Please define a name for your function.');
      }

      if (!func[functionName].handler) {
        throw new this.serverless.classes.Error('Please define a handler for your function.');
      }

      if (!func[functionName].provider.aws_lambda.memorySize) {
        throw new this.serverless.classes.Error('Please define a memory size for your function.');
      }

      if (!role) {
        throw new this.serverless.classes.Error('Please define a IAM ARN role for your function.');
      }

      if (!func[functionName].provider.aws_lambda.runtime) {
        throw new this.serverless.classes.Error('Please define a runtime for your function.');
      }

      if (!func[functionName].provider.aws_lambda.timeout) {
        throw new this.serverless.classes.Error('Please define a timeout for your function.');
      }

      newFunction.Properties.Code = ''; // Code will be added later on!
      newFunction.Properties.FunctionName = functionName;
      newFunction.Properties.Handler = func[functionName].handler;
      newFunction.Properties.MemorySize = func[functionName].provider.aws_lambda.memorySize;
      newFunction.Properties.Role = role;
      newFunction.Properties.Runtime = func[functionName].provider.aws_lambda.runtime;
      newFunction.Properties.Timeout = func[functionName].provider.aws_lambda.timeout;

      const functionResourceKey = `${functionName}Lambda`;

      const newFunctionObject = {
        [functionResourceKey]: newFunction,
      };

      this.functionResources.push(newFunctionObject);
    });

    return BbPromise.resolve();
  }

  addFunctionResourcesToServiceResourcesObject() {
    const serviceResources = this.serverless.service.resources.aws;

    if (serviceResources) {
      this.functionResources.forEach((functionResource) => {
        merge(serviceResources.Resources, functionResource);
      });

      this.serverless.service.resources.aws = serviceResources;
    } else {
      const coreCFTemplate = this.serverless.utils.readFileSync(
        path.join(__dirname, '..', '..', 'templates', 'core-cf.json')
      );

      // set the necessary variables before adding the function resources
      coreCFTemplate
        .Resources
        .IamPolicyLambda
        .Properties
        .PolicyName = `${this.stage}-lambda`;
      coreCFTemplate
        .Resources
        .IamPolicyLambda
        .Properties
        .PolicyDocument
        .Statement[0]
        .Resource = `arn:aws:logs:${this.region}:*:*`;

      this.functionResources.forEach((functionResource) => {
        merge(coreCFTemplate.Resources, functionResource);
      });

      this.serverless.service.resources.aws = coreCFTemplate;
    }

    return BbPromise.resolve();
  }
}

module.exports = AwsCompileFunctionsToResources;
