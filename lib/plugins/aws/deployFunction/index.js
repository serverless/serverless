'use strict';

const BbPromise = require('bluebird');
const _ = require('lodash');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const validate = require('../lib/validate');
const filesize = require('filesize');

class AwsDeployFunction {
  constructor(serverless, options) {
    this.serverless = serverless;
    this.options = options || {};
    this.packagePath = this.options.package ||
      this.serverless.service.package.path ||
      path.join(this.serverless.config.servicePath || '.', '.serverless');
    this.provider = this.serverless.getProvider('aws');

    // used to store data received via AWS SDK
    this.serverless.service.provider.remoteFunctionData = null;

    Object.assign(this, validate);

    this.hooks = {
      'deploy:function:initialize': () => BbPromise.bind(this)
        .then(this.validate)
        .then(this.checkIfFunctionExists),

      'deploy:function:packageFunction': () => this.serverless.pluginManager
        .spawn('package:function'),

      'deploy:function:deploy': () => BbPromise.bind(this)
        .then(() => {
          if (!this.options['update-config']) {
            return this.deployFunction();
          }

          return BbPromise.resolve();
        })
        .then(this.updateFunctionConfiguration)
        .then(() => this.serverless.pluginManager.spawn('aws:common:cleanupTempDir')),
    };
  }

  checkIfFunctionExists() {
    // check if the function exists in the service
    this.options.functionObj = this.serverless.service.getFunction(this.options.function);

    // check if function exists on AWS
    const params = {
      FunctionName: this.options.functionObj.name,
    };

    return this.provider.request(
      'Lambda',
      'getFunction',
      params
    )
      .then((result) => {
        this.serverless.service.provider.remoteFunctionData = result;
        return result;
      })
      .catch(() => {
        const errorMessage = [
          `The function "${this.options.function}" you want to update is not yet deployed.`,
          ' Please run "serverless deploy" to deploy your service.',
          ' After that you can redeploy your services functions with the',
          ' "serverless deploy function" command.',
        ].join('');
        throw new this.serverless.classes.Error(errorMessage);
      });
  }

  normalizeArnRole(role) {
    if (typeof role === 'string') {
      if (role.indexOf(':') === -1) {
        const roleResource = this.serverless.service.resources.Resources[role];

        if (roleResource.Type !== 'AWS::IAM::Role') {
          throw new Error('Provided resource is not IAM Role.');
        }

        const roleProperties = roleResource.Properties;
        const compiledFullRoleName = `${roleProperties.Path || '/'}${roleProperties.RoleName}`;

        return this.provider.getAccountInfo().then((result) =>
          `arn:${result.partition}:iam::${result.accountId}:role${compiledFullRoleName}`
        );
      }

      return BbPromise.resolve(role);
    }

    return this.provider.request(
      'IAM',
      'getRole',
      {
        RoleName: role['Fn::GetAtt'][0],
      }
    ).then((data) => data.Arn);
  }

  callUpdateFunctionConfiguration(params) {
    return this.provider.request(
      'Lambda',
      'updateFunctionConfiguration',
      params
    ).then(() => {
      this.serverless.cli.log(`Successfully updated function: ${this.options.function}`);
    });
  }

  updateFunctionConfiguration() {
    const functionObj = this.options.functionObj;
    const serviceObj = this.serverless.service.serviceObject;
    const providerObj = this.serverless.service.provider;
    const params = {
      FunctionName: functionObj.name,
    };

    if ('awsKmsKeyArn' in functionObj && !_.isObject(functionObj.awsKmsKeyArn)) {
      params.KMSKeyArn = functionObj.awsKmsKeyArn;
    } else if (serviceObj && 'awsKmsKeyArn' in serviceObj && !_.isObject(serviceObj.awsKmsKeyArn)) {
      params.KMSKeyArn = serviceObj.awsKmsKeyArn;
    }

    if ('description' in functionObj && !_.isObject(functionObj.description)) {
      params.Description = functionObj.description;
    }

    if ('memorySize' in functionObj && !_.isObject(functionObj.memorySize)) {
      params.MemorySize = functionObj.memorySize;
    } else if ('memorySize' in providerObj && !_.isObject(providerObj.memorySize)) {
      params.MemorySize = providerObj.memorySize;
    }

    if ('timeout' in functionObj && !_.isObject(functionObj.timeout)) {
      params.Timeout = functionObj.timeout;
    } else if ('timeout' in providerObj && !_.isObject(providerObj.timeout)) {
      params.Timeout = providerObj.timeout;
    }

    if (functionObj.onError && !_.isObject(functionObj.onError)) {
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

      if (_.some(params.Environment.Variables, value => _.isObject(value))) {
        delete params.Environment;
      } else {
        Object.keys(params.Environment.Variables).forEach((key) => {
          // taken from the bash man pages
          if (!key.match(/^[A-Za-z_][a-zA-Z0-9_]*$/)) {
            const errorMessage = 'Invalid characters in environment variable';
            throw new this.serverless.classes.Error(errorMessage);
          }
          if (!_.isString(params.Environment.Variables[key])) {
            const errorMessage = `Environment variable ${key} must contain strings`;
            throw new this.serverless.classes.Error(errorMessage);
          }
        });
      }
    }

    if (functionObj.vpc || providerObj.vpc) {
      const vpc = functionObj.vpc || providerObj.vpc;
      params.VpcConfig = {};

      if (_.isArray(vpc.securityGroupIds) && !_.some(vpc.securityGroupIds, _.isObject)) {
        params.VpcConfig.SecurityGroupIds = vpc.securityGroupIds;
      }

      if (_.isArray(vpc.subnetIds) && !_.some(vpc.subnetIds, _.isObject)) {
        params.VpcConfig.SubnetIds = vpc.subnetIds;
      }

      if (_.isEmpty(params.VpcConfig)) {
        delete params.VpcConfig;
      }
    }

    if ('role' in functionObj && !_.isObject(functionObj.role)) {
      return this.normalizeArnRole(functionObj.role).then(roleArn => {
        params.Role = roleArn;

        return this.callUpdateFunctionConfiguration(params);
      });
    } else if ('role' in providerObj && !_.isObject(providerObj.role)) {
      return this.normalizeArnRole(providerObj.role).then(roleArn => {
        params.Role = roleArn;

        return this.callUpdateFunctionConfiguration(params);
      });
    }

    if (_.isEmpty(_.omit(params, 'FunctionName'))) {
      return BbPromise.resolve();
    }

    return this.callUpdateFunctionConfiguration(params);
  }

  deployFunction() {
    const artifactFileName = this.provider.naming
      .getFunctionArtifactName(this.options.function);
    let artifactFilePath = this.serverless.service.package.artifact ||
      path.join(this.packagePath, artifactFileName);

    // check if an artifact is used in function package level
    const functionObject = this.serverless.service.getFunction(this.options.function);
    if (_.has(functionObject, ['package', 'artifact'])) {
      artifactFilePath = functionObject.package.artifact;
    }

    const data = fs.readFileSync(artifactFilePath);

    const remoteHash = this.serverless.service.provider.remoteFunctionData.Configuration.CodeSha256;
    const localHash = crypto.createHash('sha256').update(data).digest('base64');

    if (remoteHash === localHash && !this.options.force) {
      this.serverless.cli.log('Code not changed. Skipping function deployment.');
      return BbPromise.resolve();
    }

    const params = {
      FunctionName: this.options.functionObj.name,
      ZipFile: data,
    };

    const stats = fs.statSync(artifactFilePath);
    this.serverless.cli.log(
      `Uploading function: ${this.options.function} (${filesize(stats.size)})...`
    );

    return this.provider.request(
      'Lambda',
      'updateFunctionCode',
      params
    ).then(() => {
      this.serverless.cli.log(`Successfully deployed function: ${this.options.function}`);
    });
  }
}

module.exports = AwsDeployFunction;
