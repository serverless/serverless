'use strict';

class AwsCompileFunctions {
  constructor(serverless) {
    this.serverless = serverless;

    this.hooks = {
      'deploy:compileFunctions': this.compileFunctions.bind(this),
    };
  }

  compileFunctions(options) {
    this.options = options;

    if (!options.stage) {
      throw new this.serverless.Error('Please provide a stage');
    }

    if (!options.region) {
      throw new this.serverless.Error('Please provide a region');
    }

    this.compiledFunctionResources = [];
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

      newFunction.Properties.Code
        .S3Bucket =
        `${this.serverless.service.service}-${this.options.stage}-${this.options.region}`;
      newFunction.Properties.Code
        .S3Key = ''; // will be replaced in a further step

      newFunction.Properties.FunctionName = `${this.serverless.service.service}-${functionName}`;
      newFunction.Properties.Handler = functionObj.handler;
      newFunction.Properties.MemorySize = functionObj.provider.aws.memorySize || 1024;
      newFunction.Properties.Role = ''; // will be replaced in a further step
      newFunction.Properties.Runtime = functionObj.provider.aws.runtime || 'nodejs4.3';
      newFunction.Properties.Timeout = functionObj.provider.aws.timeout || 6;

      const newFunctionObject = {
        [functionName]: newFunction,
      };

      this.compiledFunctionResources.push(newFunctionObject);
    });

    this.serverless.service.compiledFunctionResources = this.compiledFunctionResources;
  }
}

module.exports = AwsCompileFunctions;
