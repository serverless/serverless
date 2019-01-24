'use strict';

const BbPromise = require('bluebird');
const extendedValidate = require('./lib/extendedValidate');
const setBucketName = require('../lib/setBucketName');
const checkForChanges = require('./lib/checkForChanges');
const monitorStack = require('../lib/monitorStack');
const createStack = require('./lib/createStack');
const cleanupS3Bucket = require('./lib/cleanupS3Bucket');
const uploadArtifacts = require('./lib/uploadArtifacts');
const validateTemplate = require('./lib/validateTemplate');
const updateStack = require('../lib/updateStack');
const existsDeploymentBucket = require('./lib/existsDeploymentBucket');
const path = require('path');

class AwsDeploy {
  constructor(serverless, options) {
    this.serverless = serverless;
    this.options = options;
    this.provider = this.serverless.getProvider('aws');
    this.servicePath = this.serverless.config.servicePath || '';
    this.packagePath = this.options.package ||
      this.serverless.service.package.path ||
      path.join(this.servicePath, '.serverless');

    Object.assign(
      this,
      extendedValidate,
      createStack,
      setBucketName,
      checkForChanges,
      cleanupS3Bucket,
      uploadArtifacts,
      validateTemplate,
      updateStack,
      existsDeploymentBucket,
      monitorStack
    );

    // Define the internal lifecycle model
    this.commands = {
      aws: {
        type: 'entrypoint',
        commands: {
          deploy: {
            commands: {
              deploy: {
                lifecycleEvents: [
                  'createStack',
                  'checkForChanges',
                  'uploadArtifacts',
                  'validateTemplate',
                  'updateStack',
                ],
              },
              finalize: {
                lifecycleEvents: [
                  'cleanup',
                ],
              },
            },
          },
        },
      },
    };

    this.hooks = {
      'before:deploy:deploy': () => BbPromise.bind(this)
        .then(() => this.serverless.pluginManager.spawn('aws:common:validate'))
        .then(() => {
          const bucketName = this.serverless.service.provider.deploymentBucket;
          if (bucketName) {
            return this.existsDeploymentBucket(bucketName);
          }

          return BbPromise.resolve();
        })
        .then(() => {
          if (!this.options.package && !this.serverless.service.package.path) {
            return this.extendedValidate();
          }
          return BbPromise.bind(this)
            .then(() => this.serverless.pluginManager.spawn('aws:common:moveArtifactsToTemp'))
            .then(this.extendedValidate);
        }),

      // Deploy outer lifecycle
      'deploy:deploy': () => BbPromise.bind(this)
        .then(() => {
          if (this.options.noDeploy) {
            return BbPromise.resolve();
          }
          return this.serverless.pluginManager.spawn('aws:deploy:deploy');
        }),

      'deploy:finalize': () => this.serverless.pluginManager.spawn('aws:deploy:finalize'),

      // Deploy deploy inner lifecycle
      'aws:deploy:deploy:createStack': () => BbPromise.bind(this)
        .then(this.createStack),

      'aws:deploy:deploy:checkForChanges': () => BbPromise.bind(this)
        .then(this.setBucketName)
        .then(this.checkForChanges),

      'aws:deploy:deploy:uploadArtifacts': () => BbPromise.bind(this)
        .then(() => {
          if (this.serverless.service.provider.shouldNotDeploy) {
            return BbPromise.resolve();
          }
          return BbPromise.bind(this).then(this.uploadArtifacts);
        }),

      'aws:deploy:deploy:validateTemplate': () => BbPromise.bind(this)
        .then(() => {
          if (this.serverless.service.provider.shouldNotDeploy) {
            return BbPromise.resolve();
          }
          return BbPromise.bind(this).then(this.validateTemplate);
        }),

      'aws:deploy:deploy:updateStack': () => BbPromise.bind(this)
        .then(() => {
          if (this.serverless.service.provider.shouldNotDeploy) {
            return BbPromise.resolve();
          }
          return BbPromise.bind(this).then(this.updateStack);
        }),

      // Deploy finalize inner lifecycle
      'aws:deploy:finalize:cleanup': () => BbPromise.bind(this)
        .then(() => {
          if (this.options.noDeploy || this.serverless.service.provider.shouldNotDeploy) {
            return BbPromise.resolve();
          }
          return this.cleanupS3Bucket();
        })
        .then(() => {
          if (this.options.package || this.serverless.service.package.path) {
            return BbPromise.bind(this)
              .then(() => this.serverless.pluginManager.spawn('aws:common:cleanupTempDir'));
          }
          return BbPromise.resolve();
        }),
    };
  }
}

module.exports = AwsDeploy;
