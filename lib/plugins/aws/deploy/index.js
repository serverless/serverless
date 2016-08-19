'use strict';

const BbPromise = require('bluebird');
const validate = require('../lib/validate');
const createStack = require('./lib/createStack');
const mergeCustomProviderResources = require('./lib/mergeCustomProviderResources');
const uploadCloudFormationTemplate = require('./lib/uploadCloudFormationTemplate');
const uploadDeploymentPackage = require('./lib/uploadDeploymentPackage');
const deployFunctions = require('./lib/deployFunctions');
const updateStack = require('./lib/updateStack');

const SDK = require('../');

class AwsDeploy {
  constructor(serverless, options) {
    this.serverless = serverless;
    this.options = options;
    this.provider = 'aws';
    this.sdk = new SDK(serverless);

    Object.assign(
      this,
      validate,
      createStack,
      mergeCustomProviderResources,
      uploadCloudFormationTemplate,
      uploadDeploymentPackage,
      deployFunctions,
      updateStack
    );

    this.hooks = {
      'before:deploy:initialize': () => BbPromise.bind(this)
          .then(this.validate),

      'deploy:setupProviderConfiguration': () => BbPromise.bind(this).then(this.createStack),

      'before:deploy:deploy': () => BbPromise.bind(this).then(this.mergeCustomProviderResources),

      'deploy:deploy': () => BbPromise.bind(this)
        .then(() => this.sdk
          .getServerlessDeploymentBucketName(this.options.stage, this.options.region)
            .then((bucketName) => {
              this.bucketName = bucketName;
            })
        )
        .then(this.uploadCloudFormationTemplate)
        .then(this.uploadDeploymentPackage)
        .then(this.deployFunctions)
        .then(this.updateStack)
        .then(() => {
          const msg = this.options.noDeploy ?
            'Did not deploy due to --noDeploy' :
            'Deployment successful!';

          this.serverless.cli.log(msg);
        }),
    };
  }
}

module.exports = AwsDeploy;
