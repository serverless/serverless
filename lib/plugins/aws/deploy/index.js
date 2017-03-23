'use strict';

/*
 * serverless package => package in default .serverless dir
 * serverless package --package => package in custom path
 *
 * serverless deploy => package in default .serverless & deploy from default .serverless
 * serverless deploy --package => deploy from custom path
 */

const BbPromise = require('bluebird');
const extendedValidate = require('./lib/extendedValidate');
const monitorStack = require('../lib/monitorStack');
const createStack = require('./lib/createStack');
const setBucketName = require('../lib/setBucketName');
const cleanupS3Bucket = require('./lib/cleanupS3Bucket');
const uploadArtifacts = require('./lib/uploadArtifacts');
const updateStack = require('../lib/updateStack');

class AwsDeploy {
  constructor(serverless, options) {
    this.serverless = serverless;
    this.options = options;
    this.provider = this.serverless.getProvider('aws');

    Object.assign(
      this,
      extendedValidate,
      createStack,
      setBucketName,
      cleanupS3Bucket,
      uploadArtifacts,
      updateStack,
      monitorStack
    );

    // Define the internal lifecycle model
    this.commands = {
      aws: {
        type: 'entrypoint',
        commands: {
          deploy: {
            commands: {
              initialize: {
                lifecycleEvents: [
                  'validate',
                  'package',
                  'validatePackage',
                ],
              },
              deploy: {
                lifecycleEvents: [
                  'createStack',
                  'uploadArtifacts',
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
      // Deploy outer lifecycle
      'deploy:initialize': () => this.serverless.pluginManager.spawn('aws:deploy:initialize'),

      'deploy:deploy': () => this.serverless.pluginManager.spawn('aws:deploy:deploy'),

      'deploy:finalize': () => this.serverless.pluginManager.spawn('aws:deploy:finalize'),

      // Deploy initialize inner lifecycle
      'aws:deploy:initialize:validate': () => this.serverless.pluginManager
        .spawn('aws:common:validate'),

      'aws:deploy:initialize:package': () => {
        if (!this.options.package) {
          return this.serverless.pluginManager.spawn('package');
        }
        return BbPromise.resolve();
      },

      'aws:deploy:initialize:validatePackage': () => BbPromise.bind(this)
        .then(this.extendedValidate),

      // Deploy deploy inner lifecycle
      'aws:deploy:deploy:createStack': () => BbPromise.bind(this)
        .then(this.createStack),

      'aws:deploy:deploy:uploadArtifacts': () => BbPromise.bind(this)
        .then(this.setBucketName)
        .then(this.uploadArtifacts),

      'aws:deploy:deploy:updateStack': () => BbPromise.bind(this)
        .then(this.updateStack),

      // Deploy finalize inner lifecycle
      'aws:deploy:finalize:cleanup': () => BbPromise.bind(this)
        .then(this.cleanupS3Bucket),

    };
  }
}

module.exports = AwsDeploy;
