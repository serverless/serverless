'use strict';

const path = require('path');
const BbPromise = require('bluebird');
const forEach = require('lodash').forEach;
const merge = require('lodash').merge;
const find = require('lodash').find;

module.exports = {
  validateForCompile() {
    if (!this.options.stage) {
      throw new this.serverless.classes.Error('Please pass in a valid stage.');
    }

    if (!this.options.region) {
      throw new this.serverless.classes.Error('Please pass in a valid region.');
    }

    BbPromise.resolve();
  },

  extractFunctions() {
    const rawFunctionObjects = this.serverless.service.functions;

    forEach(rawFunctionObjects, (value, key) => {
      // check if it's the function and not the name_template property
      if (key !== 'name_template') {
        const functionObject = {
          [key]: value,
        };

        this.functionObjects.push(functionObject);
      }
    });

    return BbPromise.resolve();
  },

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

      // get the URL to the uploaded functions zip file
      const s3FileUrl = find(this.deployedFunctions, { name: functionName }).s3FileUrl;

      if (!s3FileUrl || !s3FileUrl.length) {
        throw new this.serverless.classes.Error('Please ensure that the code is uploaded.');
      }

      newFunction.Properties.Code = s3FileUrl;
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
  },

  addFunctionResourcesToServiceResourcesObject() {
    const serviceResources = this.serverless.service.resources.aws;

    this.functionResources.forEach((functionResource) => {
      merge(serviceResources.Resources, functionResource);
    });

    this.serverless.service.resources.aws = serviceResources;

    return BbPromise.resolve();
  },

  compile() {
    return BbPromise.bind(this)
      .then(this.validateForCompile)
      .then(this.extractFunctions)
      .then(this.createFunctionResources)
      .then(this.addFunctionResourcesToServiceResourcesObject);
  },
};
