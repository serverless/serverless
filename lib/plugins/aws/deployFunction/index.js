'use strict';

const BbPromise = require('bluebird');
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

    Object.assign(this, validate);

    this.hooks = {
      'deploy:function:initialize': () => BbPromise.bind(this)
        .then(this.validate)
        .then(this.logStatus)
        .then(this.checkIfFunctionExists),

      'deploy:function:packageFunction': () => this.serverless.pluginManager
        .spawn('package:function'),

      'deploy:function:deploy': () => BbPromise.bind(this)
        .then(this.deployFunction)
        .then(() => this.serverless.pluginManager.spawn('aws:common:cleanupTempDir')),
    };
  }

  logStatus() {
    this.serverless.cli.log(`Deploying function: ${this.options.function}...`);
    return BbPromise.resolve();
  }

  checkIfFunctionExists() {
    // check if the function exists in the service
    this.options.functionObj = this.serverless.service.getFunction(this.options.function);

    // check if function exists on AWS
    const params = {
      FunctionName: this.options.functionObj.name,
    };

    this.provider.request(
      'Lambda',
      'getFunction',
      params,
      this.options.stage, this.options.region
    ).catch(() => {
      const errorMessage = [
        `The function "${this.options.function}" you want to update is not yet deployed.`,
        ' Please run "serverless deploy" to deploy your service.',
        ' After that you can redeploy your services functions with the',
        ' "serverless deploy function" command.',
      ].join('');
      throw new this.serverless.classes
        .Error(errorMessage);
    });

    return BbPromise.resolve();
  }

  deployFunction() {
    const artifactFileName = this.provider.naming
      .getFunctionArtifactName(this.options.function);
    const artifactFilePath = path.join(this.packagePath, artifactFileName);
    const data = fs.readFileSync(artifactFilePath);

    const params = {
      FunctionName: this.options.functionObj.name,
      ZipFile: data,
    };

    // Get function stats
    const stats = fs.statSync(artifactFilePath);
    this.serverless.cli.log(
      `Uploading function: ${this.options.function} (${filesize(stats.size)})...`
    );

    // Perform upload
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
