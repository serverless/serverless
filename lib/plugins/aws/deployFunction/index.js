'use strict';

const BbPromise = require('bluebird');
const fs = require('fs');
const validate = require('../lib/validate');
const filesize = require('filesize');

// The Package plugin which is used to zip the service
const Package = require('../../package');

class AwsDeployFunction {
  constructor(serverless, options) {
    this.serverless = serverless;
    this.options = options || {};
    this.provider = this.serverless.getProvider('aws');

    this.pkg = new Package(this.serverless, this.options);

    Object.assign(this, validate);

    this.hooks = {
      'deploy:function:initialize': () => BbPromise.bind(this)
        .then(this.validate)
        .then(this.logStatus)
        .then(this.checkIfFunctionExists),

      'deploy:function:packageFunction': () => BbPromise.bind(this)
        .then(this.packageFunction),

      'deploy:function:deploy': () => BbPromise.bind(this)
        .then(this.deployFunction)
        .then(this.cleanup),
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

  packageFunction() {
    this.serverless.cli.log(`Packaging function: ${this.options.function}...`);
    return this.pkg.packageFunction(this.options.function);
  }

  deployFunction() {
    const data = fs.readFileSync(this.options.functionObj.artifact);

    const params = {
      FunctionName: this.options.functionObj.name,
      ZipFile: data,
    };

    // Get function stats
    const stats = fs.statSync(this.options.functionObj.artifact);
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

  cleanup() {
    return this.pkg.cleanup();
  }
}

module.exports = AwsDeployFunction;
