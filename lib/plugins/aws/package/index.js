'use strict';

const BbPromise = require('bluebird');
const path = require('path');
const mergeCustomProviderResources = require('./lib/mergeCustomProviderResources');
const generateArtifactDirectoryName = require('./lib/generateArtifactDirectoryName');
const generateCoreTemplate = require('./lib/generateCoreTemplate');
const saveServiceState = require('./lib/saveServiceState');
const saveCompiledTemplate = require('./lib/saveCompiledTemplate');
const mergeIamTemplates = require('./lib/mergeIamTemplates');
const zipService = require('./lib/zipService');
const packageService = require('./lib/packageService');

class AwsPackage {
  constructor(serverless, options) {
    this.serverless = serverless;
    this.options = options;
    this.servicePath = this.serverless.config.servicePath || '';
    this.packagePath = this.options.package ||
      this.serverless.service.package.path ||
      path.join(this.servicePath || '.', '.serverless');
    this.provider = this.serverless.getProvider('aws');

    Object.assign(
      this,
      packageService,
      zipService,
      generateCoreTemplate,
      mergeIamTemplates,
      generateArtifactDirectoryName,
      mergeCustomProviderResources,
      saveServiceState,
      saveCompiledTemplate
    );

    // Define inner lifecycles
    this.commands = {
      aws: {
        type: 'entrypoint',
        commands: {
          package: {
            commands: {
              finalize: {
                lifecycleEvents: [
                  'mergeCustomProviderResources',
                  'saveServiceState',
                ],
              },
              function: {
                lifecycleEvents: [
                  'package',
                ],
              },
            },
          },
        },
      },
    };

    this.hooks = {
      /**
       * Outer lifecycle hooks
       */
      'package:cleanup': () => BbPromise.bind(this)
        .then(() => this.serverless.pluginManager.spawn('aws:common:validate'))
        .then(() => this.serverless.pluginManager.spawn('aws:common:cleanupTempDir')),

      'package:initialize': () => BbPromise.bind(this)
        .then(this.generateCoreTemplate),

      'package:setupProviderConfiguration': () => BbPromise.bind(this)
        .then(this.mergeIamTemplates),

      'package:createDeploymentArtifacts': () => BbPromise.bind(this)
        .then(this.packageService),

      'before:package:compileFunctions': () => BbPromise.bind(this)
        .then(this.generateArtifactDirectoryName),

      'package:finalize': () => BbPromise.bind(this)
        .then(() => this.serverless.pluginManager.spawn('aws:package:finalize')),

      /**
       * Inner lifecycle hooks
       */

      // Package finalize inner lifecycle
      'aws:package:finalize:mergeCustomProviderResources': () => BbPromise.bind(this)
        .then(this.mergeCustomProviderResources),

      'aws:package:finalize:saveServiceState': () => BbPromise.bind(this)
        .then(this.saveCompiledTemplate)
        .then(this.saveServiceState)
        .then(() => this.serverless.pluginManager.spawn('aws:common:moveArtifactsToPackage')),

      'aws:package:function:package': () => {
        if (this.options.function) {
          this.serverless.cli.log(`Packaging function: ${this.options.function}...`);
          return this.packageFunction(this.options.function);
        }
        return BbPromise.reject(new Error('Function name must be set'));
      },
    };
  }
}

module.exports = AwsPackage;
