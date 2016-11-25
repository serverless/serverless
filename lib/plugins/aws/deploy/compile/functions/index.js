'use strict';

const crypto = require('crypto');
const fs = require('fs');
const _ = require('lodash');
const path = require('path');

class AwsCompileFunctions {
  constructor(serverless, options) {
    this.serverless = serverless;
    this.options = options;
    this.provider = this.serverless.getProvider('aws');

    this.compileFunctions = this.compileFunctions.bind(this);
    this.compileFunction = this.compileFunction.bind(this);

    this.hooks = {
      'deploy:compileFunctions': this.compileFunctions,
    };
  }

  compileRole(role) {
    if (typeof role === 'object') {
      // role is an "Fn::GetAtt" object
      return role;
    } else if (role.indexOf(':') === -1) {
      // role is a Logical Role Name
      return { 'Fn::GetAtt': [role, 'Arn'] };
    }
    return role; // indicates that role is a Role ARN
  }

  compileFunction(functionName) {
    const newFunction = this.cfLambdaFunctionTemplate();
    const functionObject = this.serverless.service.getFunction(functionName);

    const artifactFilePath = this.serverless.service.package.individually ?
      functionObject.artifact :
      this.serverless.service.package.artifact;

    if (!artifactFilePath) {
      throw new Error(`No artifact path is set for function: "${functionName}"`);
    }

    if (this.serverless.service.package.deploymentBucket) {
      newFunction.Properties.Code.S3Bucket = this.serverless.service.package.deploymentBucket;
    }

    const s3Folder = this.serverless.service.package.artifactDirectoryName;
    const s3FileName = artifactFilePath.split(path.sep).pop();
    newFunction.Properties.Code.S3Key = `${s3Folder}/${s3FileName}`;

    if (!functionObject.handler) {
      const errorMessage = [
        `Missing "handler" property in function ""${functionName}".`,
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
    const Runtime = functionObject.runtime
      || this.serverless.service.provider.runtime
      || 'nodejs4.3';

    newFunction.Properties.Handler = Handler;
    newFunction.Properties.FunctionName = FunctionName;
    newFunction.Properties.MemorySize = MemorySize;
    newFunction.Properties.Timeout = Timeout;
    newFunction.Properties.Runtime = Runtime;

    if (functionObject.description) {
      newFunction.Properties.Description = functionObject.description;
    }

    if (functionObject.environment || this.serverless.service.provider.environment) {
      newFunction.Properties.Environment = {};
      newFunction.Properties.Environment.Variables = Object.assign(
        {},
        this.serverless.service.provider.environment,
        functionObject.environment
      );

      Object.keys(newFunction.Properties.Environment.Variables).forEach((key) => {
        // taken from the bash man pages
        if (!key.match(/^[A-Za-z_][a-zA-Z0-9_]*$/)) {
          const errorMessage = 'Invalid characters in environment variable';
          throw new this.serverless.classes.Error(errorMessage);
        }
      });
    }

    if ('role' in functionObject) {
      newFunction.Properties.Role = this.compileRole(functionObject.role);
    } else if ('role' in this.serverless.service.provider) {
      newFunction.Properties.Role = this.compileRole(this.serverless.service.provider.role);
    } else {
      newFunction.Properties.Role = this.compileRole('IamRoleLambdaExecution');
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

    const functionLogicalId = this.provider.naming
      .getLambdaLogicalId(functionName);
    const functionOutputLogicalId = this.provider.naming
      .getLambdaOutputLogicalId(functionName);
    const newFunctionObject = {
      [functionLogicalId]: newFunction,
    };

    _.merge(this.serverless.service.provider.compiledCloudFormationTemplate.Resources,
      newFunctionObject);

    const newVersion = this.cfLambdaVersionTemplate();

    const content = fs.readFileSync(artifactFilePath);
    const hash = crypto.createHash('sha256');
    hash.setEncoding('base64');
    hash.write(content);
    hash.end();

    newVersion.Properties.CodeSha256 = hash.read();
    newVersion.Properties.FunctionName = { Ref: functionLogicalId };

    // use the SHA in the logical resource ID of the version because
    // AWS::Lambda::Version resource will not support updates
    const versionLogicalId = this.provider.naming.getLambdaVersionLogicalId(
            functionName, newVersion.Properties.CodeSha256);
    const newVersionObject = {
      [versionLogicalId]: newVersion,
    };

    _.merge(this.serverless.service.provider.compiledCloudFormationTemplate.Resources,
      newVersionObject);

    // Add function to Outputs section
    const newOutput = this.cfOutputDescriptionTemplate();
    newOutput.Value = { 'Fn::GetAtt': [functionLogicalId, 'Arn'] };

    const newOutputObject = {
      [functionOutputLogicalId]: newOutput,
    };

    _.merge(this.serverless.service.provider.compiledCloudFormationTemplate.Outputs,
      newOutputObject);

    const functionVersionOutputLogicalId = this.provider.naming
      .getLambdaVersionOutputLogicalId(functionName);
    const newVersionOutput = this.cfOutputLatestVersionTemplate();

    newVersionOutput.Value = { Ref: versionLogicalId };

    _.merge(this.serverless.service.provider.compiledCloudFormationTemplate.Outputs, {
      [functionVersionOutputLogicalId]: newVersionOutput,
    });
  }

  compileFunctions() {
    this.serverless.service
      .getAllFunctions()
      .forEach((functionName) => this.compileFunction(functionName));
  }

  // helper functions
  cfLambdaFunctionTemplate() {
    return {
      Type: 'AWS::Lambda::Function',
      Properties: {
        Code: {
          S3Bucket: {
            Ref: 'ServerlessDeploymentBucket',
          },
          S3Key: 'S3Key',
        },
        FunctionName: 'FunctionName',
        Handler: 'Handler',
        MemorySize: 'MemorySize',
        Role: 'Role',
        Runtime: 'Runtime',
        Timeout: 'Timeout',
      },
    };
  }

  cfLambdaVersionTemplate() {
    return {
      Type: 'AWS::Lambda::Version',
      // Retain old versions even though they will not be in future
      // CloudFormation stacks. On stack delete, these will be removed when
      // their associated function is removed.
      DeletionPolicy: 'Retain',
      Properties: {
        FunctionName: 'FunctionName',
        CodeSha256: 'CodeSha256',
      },
    };
  }

  cfOutputDescriptionTemplate() {
    return {
      Description: 'Lambda function info',
      Value: 'Value',
    };
  }

  cfOutputLatestVersionTemplate() {
    return {
      Description: 'Current Lambda function version',
      Value: 'Value',
    };
  }
}

module.exports = AwsCompileFunctions;
