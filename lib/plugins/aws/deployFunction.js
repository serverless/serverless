'use strict';

const _ = require('lodash');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const wait = require('timers-ext/promise/sleep');
const validate = require('./lib/validate');
const filesize = require('filesize');
const ServerlessError = require('../../serverless-error');

class AwsDeployFunction {
  constructor(serverless, options) {
    this.serverless = serverless;
    this.options = options || {};
    this.packagePath =
      this.options.package ||
      this.serverless.service.package.path ||
      path.join(this.serverless.serviceDir || '.', '.serverless');
    this.provider = this.serverless.getProvider('aws');

    Object.assign(this, validate);

    this.hooks = {
      'deploy:function:initialize': async () => {
        await this.validate();
        await this.checkIfFunctionExists();
        this.checkIfFunctionChangesBetweenImageAndHandler();

        if (_.get(this.serverless.service.serviceObject, 'awsKmsKeyArn')) {
          this.serverless._logDeprecation(
            'AWS_KMS_KEY_ARN',
            'Starting with next major version, ' +
              '"awsKmsKeyArn" service property will be replaced by "provider.kmsKeyArn"'
          );
        }
        if (
          Object.values(this.serverless.service.functions).some(({ awsKmsKeyArn }) => awsKmsKeyArn)
        ) {
          this.serverless._logDeprecation(
            'AWS_KMS_KEY_ARN',
            'Starting with next major version, ' +
              '"awsKmsKeyArn" function property will be replaced by "kmsKeyArn"'
          );
        }
      },

      'deploy:function:packageFunction': async () =>
        this.serverless.pluginManager.spawn('package:function'),

      'deploy:function:deploy': async () => {
        if (!this.options['update-config']) {
          await this.deployFunction();
        }
        await this.updateFunctionConfiguration();
        await this.serverless.pluginManager.spawn('aws:common:cleanupTempDir');
      },
    };
  }

  async checkIfFunctionExists() {
    // check if the function exists in the service
    this.options.functionObj = this.serverless.service.getFunction(this.options.function);

    // check if function exists on AWS
    const params = {
      FunctionName: this.options.functionObj.name,
    };

    const result = await (async () => {
      try {
        return await this.provider.request('Lambda', 'getFunction', params);
      } catch (error) {
        if (_.get(error, 'providerError.code') === 'ResourceNotFoundException') {
          const errorMessage = [
            `The function "${this.options.function}" you want to update is not yet deployed.`,
            ' Please run "serverless deploy" to deploy your service.',
            ' After that you can redeploy your services functions with the',
            ' "serverless deploy function" command.',
          ].join('');
          throw new ServerlessError(errorMessage, 'FUNCTION_NOT_YET_DEPLOYED');
        }
        throw error;
      }
    })();

    if (result) this.serverless.service.provider.remoteFunctionData = result;
  }

  checkIfFunctionChangesBetweenImageAndHandler() {
    const functionObject = this.serverless.service.getFunction(this.options.function);
    const remoteFunctionPackageType =
      this.serverless.service.provider.remoteFunctionData.Configuration.PackageType;

    if (functionObject.handler && remoteFunctionPackageType === 'Image') {
      throw new ServerlessError(
        `The function "${this.options.function}" you want to update with handler was previously packaged as an image. Please run "serverless deploy" to ensure consistent deploy.`,
        'DEPLOY_FUNCTION_CHANGE_BETWEEN_HANDLER_AND_IMAGE_ERROR'
      );
    }

    if (functionObject.image && remoteFunctionPackageType === 'Zip') {
      throw new ServerlessError(
        `The function "${this.options.function}" you want to update with image was previously packaged as zip file. Please run "serverless deploy" to ensure consistent deploy.`,
        'DEPLOY_FUNCTION_CHANGE_BETWEEN_HANDLER_AND_IMAGE_ERROR'
      );
    }
  }

  async normalizeArnRole(role) {
    if (typeof role === 'string') {
      if (role.indexOf(':') !== -1) {
        return role;
      }

      const roleResource = this.serverless.service.resources.Resources[role];

      if (roleResource.Type !== 'AWS::IAM::Role') {
        throw new ServerlessError(
          'Provided resource is not IAM Role',
          'ROLE_REFERENCES_NON_AWS_IAM_ROLE'
        );
      }
      const roleProperties = roleResource.Properties;
      if (!roleProperties.RoleName) {
        throw new ServerlessError(
          'Role resource missing RoleName property',
          'MISSING_ROLENAME_FOR_ROLE'
        );
      }
      const compiledFullRoleName = `${roleProperties.Path || '/'}${roleProperties.RoleName}`;

      const result = await this.provider.getAccountInfo();
      return `arn:${result.partition}:iam::${result.accountId}:role${compiledFullRoleName}`;
    }

    const data = await this.provider.request('IAM', 'getRole', {
      RoleName: role['Fn::GetAtt'][0],
    });
    return data.Arn;
  }

  async callUpdateFunctionConfiguration(params) {
    const startTime = Date.now();

    const callWithRetry = async () => {
      try {
        await this.provider.request('Lambda', 'updateFunctionConfiguration', params);
      } catch (err) {
        const didOneMinutePass = Date.now() - startTime > 60 * 1000;

        if (err.providerError && err.providerError.code === 'ResourceConflictException') {
          if (didOneMinutePass) {
            throw new ServerlessError(
              'Retry timed out. Please try to deploy your function once again.',
              'DEPLOY_FUNCTION_CONFIGURATION_UPDATE_TIMED_OUT'
            );
          }
          this.serverless.cli.log(
            `Retrying configuration update for function: ${this.options.function}. Reason: ${err.message}`
          );
          await wait(1000);
          await callWithRetry();
        } else {
          throw err;
        }
      }
    };
    await callWithRetry();
    this.serverless.cli.log(`Successfully updated function: ${this.options.function}`);
  }

  async updateFunctionConfiguration() {
    const functionObj = this.options.functionObj;
    const serviceObj = this.serverless.service.serviceObject;
    const providerObj = this.serverless.service.provider;
    const remoteFunctionConfiguration =
      this.serverless.service.provider.remoteFunctionData.Configuration;
    const params = {
      FunctionName: functionObj.name,
    };

    const kmsKeyArn =
      functionObj.kmsKeyArn ||
      providerObj.kmsKeyArn ||
      functionObj.awsKmsKeyArn ||
      serviceObj.awsKmsKeyArn;

    if (kmsKeyArn) {
      params.KMSKeyArn = kmsKeyArn;
    }

    if (params.KMSKeyArn && params.KMSKeyArn === remoteFunctionConfiguration.KMSKeyArn) {
      delete params.KMSKeyArn;
    }

    if (
      functionObj.description &&
      functionObj.description !== remoteFunctionConfiguration.Description
    ) {
      params.Description = functionObj.description;
    }

    if (functionObj.handler && functionObj.handler !== remoteFunctionConfiguration.Handler) {
      params.Handler = functionObj.handler;
    }

    if (functionObj.memorySize) {
      params.MemorySize = functionObj.memorySize;
    } else if (providerObj.memorySize) {
      params.MemorySize = providerObj.memorySize;
    }

    if (params.MemorySize && params.MemorySize === remoteFunctionConfiguration.MemorySize) {
      delete params.MemorySize;
    }

    if (functionObj.timeout) {
      params.Timeout = functionObj.timeout;
    } else if (providerObj.timeout) {
      params.Timeout = providerObj.timeout;
    }

    if (params.Timeout && params.Timeout === remoteFunctionConfiguration.Timeout) {
      delete params.Timeout;
    }

    if (functionObj.layers && !functionObj.layers.some(_.isObject)) {
      params.Layers = functionObj.layers;
    }

    if (
      params.Layers &&
      remoteFunctionConfiguration.Layers &&
      _.isEqual(
        new Set(params.Layers),
        new Set(remoteFunctionConfiguration.Layers.map((layer) => layer.Arn))
      )
    ) {
      delete params.Layers;
    }

    if (
      functionObj.onError &&
      !_.isObject(functionObj.onError) &&
      _.get(remoteFunctionConfiguration, 'DeadLetterConfig.TargetArn', null) !== functionObj.onError
    ) {
      params.DeadLetterConfig = {
        TargetArn: functionObj.onError,
      };
    }

    if (functionObj.environment || providerObj.environment) {
      params.Environment = {};
      params.Environment.Variables = Object.assign(
        {},
        providerObj.environment,
        functionObj.environment
      );

      if (Object.values(params.Environment.Variables).some((value) => _.isObject(value))) {
        delete params.Environment;
      } else {
        Object.keys(params.Environment.Variables).forEach((key) => {
          // taken from the bash man pages
          if (!key.match(/^[A-Za-z_][a-zA-Z0-9_]*$/)) {
            const errorMessage = 'Invalid characters in environment variable';
            throw new ServerlessError(errorMessage, 'DEPLOY_FUNCTION_INVALID_ENV_VARIABLE');
          }

          if (params.Environment.Variables[key] != null) {
            params.Environment.Variables[key] = String(params.Environment.Variables[key]);
          }
        });
      }
    }

    if (
      params.Environment &&
      remoteFunctionConfiguration.Environment &&
      _.isEqual(params.Environment.Variables, remoteFunctionConfiguration.Environment.Variables)
    ) {
      delete params.Environment;
    }

    if (functionObj.vpc || providerObj.vpc) {
      const vpc = functionObj.vpc || providerObj.vpc;
      params.VpcConfig = {};

      if (Array.isArray(vpc.securityGroupIds) && !vpc.securityGroupIds.some(_.isObject)) {
        params.VpcConfig.SecurityGroupIds = vpc.securityGroupIds;
      }

      if (Array.isArray(vpc.subnetIds) && !vpc.subnetIds.some(_.isObject)) {
        params.VpcConfig.SubnetIds = vpc.subnetIds;
      }

      const didVpcChange = () => {
        const remoteConfigToCompare = { SecurityGroupIds: [], SubnetIds: [] };
        if (remoteFunctionConfiguration.VpcConfig) {
          remoteConfigToCompare.SecurityGroupIds =
            remoteFunctionConfiguration.VpcConfig.SecurityGroupIds || [];
          remoteConfigToCompare.SubnetIds = remoteFunctionConfiguration.VpcConfig.SubnetIds || [];
        }
        const localConfigToCompare = {
          SecurityGroupIds: [],
          SubnetIds: [],
          ...params.VpcConfig,
        };
        return _.isEqual(remoteConfigToCompare, localConfigToCompare);
      };

      if (!Object.keys(params.VpcConfig).length || didVpcChange()) {
        delete params.VpcConfig;
      }
    }

    const executionRole = this.provider.getCustomExecutionRole(functionObj);
    if (executionRole) {
      params.Role = await this.normalizeArnRole(executionRole);
    }

    if (params.Role === remoteFunctionConfiguration.Role) {
      delete params.Role;
    }

    if (functionObj.image) {
      const imageConfig = {};
      if (_.isObject(functionObj.image)) {
        if (functionObj.image.command) {
          imageConfig.Command = functionObj.image.command;
        }
        if (functionObj.image.entryPoint) {
          imageConfig.EntryPoint = functionObj.image.entryPoint;
        }
        if (functionObj.image.workingDirectory) {
          imageConfig.WorkingDirectory = functionObj.image.workingDirectory;
        }
      }

      if (
        !_.isEqual(
          imageConfig,
          _.get(remoteFunctionConfiguration, 'ImageConfigResponse.ImageConfig', {})
        )
      ) {
        params.ImageConfig = imageConfig;
      }
    }

    if (!Object.keys(_.omit(params, 'FunctionName')).length) {
      this.serverless.cli.log(
        'Configuration did not change. Skipping function configuration update.'
      );
      return;
    }

    await this.callUpdateFunctionConfiguration(params);
  }

  async deployFunction() {
    const functionObject = this.serverless.service.getFunction(this.options.function);
    const params = {
      FunctionName: this.options.functionObj.name,
    };

    if (functionObject.image) {
      const { functionImageUri, functionImageSha } = await this.provider.resolveImageUriAndSha(
        this.options.function
      );
      const remoteImageSha =
        this.serverless.service.provider.remoteFunctionData.Configuration.CodeSha256;
      if (remoteImageSha === functionImageSha && !this.options.force) {
        this.serverless.cli.log('Image did not change. Skipping function deployment.');
        return;
      }
      params.ImageUri = functionImageUri;
    } else {
      const artifactFileName = this.provider.naming.getFunctionArtifactName(this.options.function);
      let artifactFilePath =
        this.serverless.service.package.artifact || path.join(this.packagePath, artifactFileName);
      // check if an artifact is used in function package level
      if (_.get(functionObject, 'package.artifact')) {
        artifactFilePath = functionObject.package.artifact;
      }

      const data = fs.readFileSync(artifactFilePath);

      const remoteHash =
        this.serverless.service.provider.remoteFunctionData.Configuration.CodeSha256;
      const localHash = crypto.createHash('sha256').update(data).digest('base64');

      if (remoteHash === localHash && !this.options.force) {
        this.serverless.cli.log('Code not changed. Skipping function deployment.');
        return;
      }

      params.ZipFile = data;

      const stats = fs.statSync(artifactFilePath);
      this.serverless.cli.log(
        `Uploading function: ${this.options.function} (${filesize(stats.size)})...`
      );
    }

    await this.provider.request('Lambda', 'updateFunctionCode', params);
    this.serverless.cli.log(`Successfully deployed function: ${this.options.function}`);
  }
}

module.exports = AwsDeployFunction;
