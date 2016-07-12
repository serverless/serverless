'use strict';

const _ = require('lodash');
const path = require('path');

class AwsCompileFunctions {
  constructor(serverless, options) {
    this.serverless = serverless;
    this.options = options;
    this.provider = 'aws';

    this.hooks = {
      'deploy:compileFunctions': this.compileFunctions.bind(this),
    };
  }

  compileFunctions() {
    if (!this.serverless.service.resources.Resources) {
      throw new this.serverless.classes
        .Error('This plugin needs access to Resources section of the AWS CloudFormation template');
    }

    const functionTemplate = `
      {
        "Type": "AWS::Lambda::Function",
        "Properties": {
          "Code": {
            "S3Bucket": { "Ref": "ServerlessDeploymentBucket" },
            "S3Key": "S3Key"
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
      const functionObject = this.serverless.service.getFunction(functionName);

      newFunction.Properties.Code
        .S3Key = this.serverless.service.package.artifact.split(path.sep).pop();

      if (!functionObject.handler) {
        const errorMessage = [
          `Missing "handler" property in function ${functionName}`,
          ' Please make sure you point to the correct lambda handler.',
          ' For example: handler.hello.',
          ' Please check the docs for more info',
        ].join('');
        throw new this.serverless.classes
          .Error(errorMessage);
      }

      const Handler = functionObject.handler;
      const FunctionName = functionObject.name
        || `${this.serverless.service.service}-${this.options.stage}-${functionName}`;
      const MemorySize = Number(functionObject.memory)
        || Number(this.serverless.service.defaults.memory)
        || 1024;
      const Timeout = Number(functionObject.timeout)
        || Number(this.serverless.service.defaults.timeout)
        || 6;

      newFunction.Properties.Handler = Handler;
      newFunction.Properties.FunctionName = FunctionName;
      newFunction.Properties.MemorySize = MemorySize;
      newFunction.Properties.Timeout = Timeout;
      newFunction.Properties.Runtime = 'nodejs4.3';
      newFunction.Properties.Role = { 'Fn::GetAtt': ['IamRoleLambda', 'Arn'] };

      const newFunctionObject = {
        [functionName]: newFunction,
      };

      _.merge(this.serverless.service.resources.Resources, newFunctionObject);
    });
  }
}

module.exports = AwsCompileFunctions;
