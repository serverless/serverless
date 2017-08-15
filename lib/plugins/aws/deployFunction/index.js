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
        .then(this.deployFunction)
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
      params,
      this.options.stage, this.options.region
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
      params,
      this.options.stage, this.options.region
    ).then(() => {
      this.serverless.cli.log(`Successfully deployed function: ${this.options.function}`);
    });
  }
}

module.exports = AwsDeployFunction;
