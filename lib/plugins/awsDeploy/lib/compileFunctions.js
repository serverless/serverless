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

      const convertedRegion = this.serverless.utils.convertRegionName(this.options.region);

      const role = this.serverless.service.getVariables(
        this.options.stage,
        convertedRegion
      ).iamRoleArnLambda;

      // get the URL to the uploaded functions zip file
      const S3Key = find(this.deployedFunctions, { name: functionName }).zipFileKey;

      newFunction.Properties.Code
        .S3Bucket = `${this.serverless.service.service}-${this.options.region}`;
      newFunction.Properties.Code
        .S3Key = S3Key;
      newFunction.Properties.FunctionName = `${this.serverless.service.service}-${functionName}`;
      newFunction.Properties.Handler = functionObj.handler;
      newFunction.Properties.MemorySize = functionObj.provider.aws.memorySize || 1024;
      newFunction.Properties.Role = role;
      newFunction.Properties.Runtime = functionObj.provider.aws.runtime || 'nodejs4.3';
      newFunction.Properties.Timeout = functionObj.provider.aws.timeout || 6;

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
