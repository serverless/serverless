'use strict';

const BbPromise = require('bluebird');
const path = require('path');
const mergeCustomProviderResources = require('./lib/mergeCustomProviderResources');
const generateArtifactDirectoryName = require('./lib/generateArtifactDirectoryName');
const generateCoreTemplate = require('./lib/generateCoreTemplate');
const saveCompiledTemplate = require('./lib/saveCompiledTemplate');
const mergeIamTemplates = require('./lib/mergeIamTemplates');
const zipService = require('./lib/zipService');
const packageService = require('./lib/packageService');

class AwsPackage {
  constructor(serverless, options) {
    this.serverless = serverless;
    this.options = options;
    this.packagePath = this.options.package ||
      this.serverless.service.package.path ||
      path.join(this.serverless.config.servicePath || '.', '.serverless');
    this.provider = this.serverless.getProvider('aws');

    Object.assign(
      this,
      packageService,
      zipService,
      generateCoreTemplate,
      mergeIamTemplates,
      generateArtifactDirectoryName,
      mergeCustomProviderResources,
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
                  'saveCompiledTemplate',
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
        .then(() => this.serverless.pluginManager.spawn('aws:common:validate'))
        .then(() => this.serverless.pluginManager.spawn('aws:package:finalize')),

      /**
       * Inner lifecycle hooks
       */

      // Package finalize inner lifecycle
      'aws:package:finalize:mergeCustomProviderResources': () => BbPromise.bind(this)
        .then(this.mergeCustomProviderResources),

      'aws:package:finalize:saveCompiledTemplate': () => BbPromise.bind(this)
        .then(this.saveCompiledTemplate),
    };
  }
}

module.exports = AwsPackage;
