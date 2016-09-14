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

  /**
   * Compile the declared functions into the Cloud Formation Template (CFT)
   */
  compileFunctions() {
    if (this.anyFunctionHasNoRole()) {
      this.attachDefaultRoleAndPolicy();
    }
    this.mergeFunctionsIntoCft();
  }

  /**
   * Check whether any function is missing an assigned role
   *
   * All functions have a role if a provider-wide `role` or `roleArn` is declared.  If one is not
   * declared then each function must declare its own `role` or `roleArn`.  Each function may
   * override a declared provider level `role` or `roleArn` by declaring its own
   *
   * @returns {boolean} Whether any of the declared functions did not have an `role` or `roleArn`
   */
  anyFunctionHasNoRole() {
    let ret = false;
    if (!('role' in this.serverless.service.provider) &&
        !('roleArn' in this.serverless.service.provider)) {
      this.serverless.service.getAllFunctions().forEach((functionName) => {
        const functionObject = this.serverless.service.getFunction(functionName);
        if (!('role' in functionObject) &&
            !('roleArn' in functionObject)) {
          ret = true;
        }
      });
    }
    return ret;
  }

  /**
   * Attach the default role and policy to the provider for application into the CFT.
   */
  attachDefaultRoleAndPolicy() {
    // merge in the iamRoleLambdaTemplate
    const iamRoleLambdaExecutionTemplate = this.serverless.utils.readFileSync(
        path.join(this.serverless.config.serverlessPath,
            'plugins',
            'aws',
            'deploy',
            'compile',
            'functions',
            'iam-role-lambda-execution-template.json')
    );

    _.merge(this.serverless.service.provider.compiledCloudFormationTemplate.Resources,
        iamRoleLambdaExecutionTemplate);

    // merge in the iamPolicyLambdaTemplate
    const iamPolicyLambdaExecutionTemplate = this.serverless.utils.readFileSync(
        path.join(this.serverless.config.serverlessPath,
            'plugins',
            'aws',
            'deploy',
            'compile',
            'functions',
            'iam-policy-lambda-execution-template.json')
    );

    _.merge(this.serverless.service.provider.compiledCloudFormationTemplate.Resources,
        iamPolicyLambdaExecutionTemplate);

    // set the necessary variables for the IamPolicyLambda
    this.serverless.service.provider.compiledCloudFormationTemplate
        .Resources
        .IamPolicyLambdaExecution
        .Properties
        .PolicyName = `${this.options.stage}-${this.serverless.service.service}-lambda`;
    this.serverless.service.provider.compiledCloudFormationTemplate
        .Resources
        .IamPolicyLambdaExecution
        .Properties
        .PolicyDocument
        .Statement[0]
        .Resource = `arn:aws:logs:${this.options.region}:*:*`;

    // add custom iam role statements
    if (this.serverless.service.provider.iamRoleStatements &&
        this.serverless.service.provider.iamRoleStatements instanceof Array) {
      this.serverless.service.provider.compiledCloudFormationTemplate
          .Resources
          .IamPolicyLambdaExecution
          .Properties
          .PolicyDocument
          .Statement = this.serverless.service.provider.compiledCloudFormationTemplate
          .Resources
          .IamPolicyLambdaExecution
          .Properties
          .PolicyDocument
          .Statement.concat(this.serverless.service.provider.iamRoleStatements);
    }
  }

  /**
   * Merge the function declarations into the CFT.
   */
  mergeFunctionsIntoCft() {
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

    const outputTemplate = `
        {
          "Description": "Lambda function info",
          "Value": "Value"
        }
       `;

    this.serverless.service.getAllFunctions().forEach((functionName) => {
      const newFunction = JSON.parse(functionTemplate);
      const functionObject = this.serverless.service.getFunction(functionName);

      const artifactFilePath = this.serverless.service.package.individually ?
          functionObject.artifact :
          this.serverless.service.package.artifact;

      if (!artifactFilePath) {
        throw new Error(`No artifact path is set for function: ${functionName}`);
      }

      const s3Folder = this.serverless.service.package.artifactDirectoryName;
      const s3FileName = artifactFilePath.split(path.sep).pop();
      newFunction.Properties.Code.S3Key = `${s3Folder}/${s3FileName}`;

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
      const FunctionName = functionObject.name;
      const MemorySize = Number(functionObject.memorySize)
          || Number(this.serverless.service.provider.memorySize)
          || 1024;
      const Timeout = Number(functionObject.timeout)
          || Number(this.serverless.service.provider.timeout)
          || 6;
      const Runtime = this.serverless.service.provider.runtime
          || 'nodejs4.3';

      newFunction.Properties.Handler = Handler;
      newFunction.Properties.FunctionName = FunctionName;
      newFunction.Properties.MemorySize = MemorySize;
      newFunction.Properties.Timeout = Timeout;
      newFunction.Properties.Runtime = Runtime;

      // translate role to roleArn
      if ('role' in functionObject) {
        functionObject.roleArn = { 'Fn::GetAtt': [functionObject.role, 'Arn'] };
      } else if ('role' in this.serverless.service.provider) {
        functionObject.roleArn = { 'Fn::GetAtt': [functionObject.role, 'Arn'] };
      }

      // move declared iamRoleArn to lambda CFT
      if ('roleArn' in functionObject) {
        newFunction.Properties.Role = functionObject.roleArn;
      } else if ('roleArn' in this.serverless.service.provider) {
        newFunction.Properties.Role = this.serverless.service.provider.roleArn;
      } else { // use default role
        newFunction.Properties.Role = { 'Fn::GetAtt': ['IamRoleLambdaExecution', 'Arn'] };
      }

      if (!functionObject.vpc) functionObject.vpc = {};
      if (!this.serverless.service.provider.vpc) this.serverless.service.provider.vpc = {};

      newFunction.Properties.VpcConfig = {
        SecurityGroupIds: functionObject.vpc.securityGroupIds ||
        this.serverless.service.provider.vpc.securityGroupIds,
        SubnetIds: functionObject.vpc.subnetIds || this.serverless.service.provider.vpc.subnetIds,
      };

      if (!newFunction.Properties.VpcConfig.SecurityGroupIds
          || !newFunction.Properties.VpcConfig.SubnetIds) {
        delete newFunction.Properties.VpcConfig;
      }

      const normalizedFunctionName = functionName[0].toUpperCase() + functionName.substr(1);
      const functionLogicalId = `${normalizedFunctionName}LambdaFunction`;
      const newFunctionObject = {
        [functionLogicalId]: newFunction,
      };

      _.merge(this.serverless.service.provider.compiledCloudFormationTemplate.Resources,
          newFunctionObject);

      // Add function to Outputs section
      const newOutput = JSON.parse(outputTemplate);
      newOutput.Value = { 'Fn::GetAtt': [functionLogicalId, 'Arn'] };

      const newOutputObject = {
        [`${functionLogicalId}Arn`]: newOutput,
      };

      _.merge(this.serverless.service.provider.compiledCloudFormationTemplate.Outputs,
          newOutputObject);
    });
  }
}

module.exports = AwsCompileFunctions;
