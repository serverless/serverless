'use strict';

const BbPromise = require('bluebird');
const merge = require('lodash').merge;
const find = require('lodash').find;

module.exports = {

  createFunctionResources() {
    this.functionResources = [];
    const functionTemplate = `
      {
        "Type": "AWS::Lambda::Function",
        "Properties": {
        "Code": {
          "S3Bucket": "",
          "S3Key": ""
        },
        "FunctionName": "FunctionName",
          "Handler": "Handler",
          "MemorySize": "MemorySize",
          "Role": "Role",
          "Runtime": "Runtime",
          "Timeout": "Timeout"
        }
      }
    `;

    this.serverless.service.getAllFunctions().forEach((functionName) => {
      const newFunction = JSON.parse(functionTemplate);
      const functionObj = this.serverless.service.getFunction(functionName);

      const convertedRegion = this.serverless.utils.convertRegionName(this.options.region)

      const role = this.serverless.service.getVariables(
        this.options.stage,
        convertedRegion
      ).iamRoleArnLambda;

      if (!functionName) {
        throw new this.serverless.classes.Error('Please define a name for your function.');
      }

      if (!functionObj.handler) {
        throw new this.serverless.classes.Error('Please define a handler for your function.');
      }

      if (!functionObj.provider.aws.memorySize) {
        throw new this.serverless.classes.Error('Please define a memory size for your function.');
      }

      if (!role) {
        throw new this.serverless.classes.Error('Please define a IAM ARN role for your function.');
      }

      if (!functionObj.provider.aws.runtime) {
        throw new this.serverless.classes.Error('Please define a runtime for your function.');
      }

      if (!functionObj.provider.aws.timeout) {
        throw new this.serverless.classes.Error('Please define a timeout for your function.');
      }

      // get the URL to the uploaded functions zip file
      //console.log(this.deployedFunctions)
      const S3Key = find(this.deployedFunctions, { name: functionName }).zipFileKey;

      newFunction.Properties.Code.S3Bucket = `${this.serverless.service.service}-${this.options.region}`;
      newFunction.Properties.Code.S3Key = S3Key;
      newFunction.Properties.FunctionName = `${this.serverless.service.service}-${functionName}`;
      newFunction.Properties.Handler = functionObj.handler;
      newFunction.Properties.MemorySize = functionObj.provider.aws.memorySize;
      newFunction.Properties.Role = role;
      newFunction.Properties.Runtime = functionObj.provider.aws.runtime;
      newFunction.Properties.Timeout = functionObj.provider.aws.timeout;

      const newFunctionObject = {
        [functionName]: newFunction,
      };

      this.functionResources.push(newFunctionObject);
    });

    return BbPromise.resolve();
  },

  addFunctionResourcesToServiceResourcesObject() {
    this.serverless.cli.log('Adding function resources to CF...');
    const serviceResources = this.serverless.service.resources.aws;

    this.functionResources.forEach((functionResource) => {
      merge(serviceResources.Resources, functionResource);
    });

    this.serverless.service.resources.aws = serviceResources;

    return BbPromise.resolve();
  },

  compileFunctions() {
    return BbPromise.bind(this)
      .then(this.createFunctionResources)
      .then(this.addFunctionResourcesToServiceResourcesObject);
  },
};
