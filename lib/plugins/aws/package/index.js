'use strict';

const BbPromise = require('bluebird');
const path = require('path');
const mergeCustomProviderResources = require('./lib/mergeCustomProviderResources');
const stripNullPropsFromTemplateResources = require('./lib/stripNullPropsFromTemplateResources');
const generateArtifactDirectoryName = require('./lib/generateArtifactDirectoryName');
const generateCoreTemplate = require('./lib/generateCoreTemplate');
const saveServiceState = require('./lib/saveServiceState');
const saveCompiledTemplate = require('./lib/saveCompiledTemplate');
const mergeIamTemplates = require('./lib/mergeIamTemplates');
const addExportNameForOutputs = require('./lib/addExportNameForOutputs');

class AwsPackage {
  constructor(serverless, options) {
    this.serverless = serverless;
    this.options = options;
    this.servicePath = this.serverless.serviceDir || '';
    this.packagePath =
      this.options.package ||
      this.serverless.service.package.path ||
      path.join(this.servicePath || '.', '.serverless');
    this.provider = this.serverless.getProvider('aws');

    Object.assign(
      this,
      generateCoreTemplate,
      mergeIamTemplates,
      generateArtifactDirectoryName,
      addExportNameForOutputs,
      mergeCustomProviderResources,
      stripNullPropsFromTemplateResources,
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
                  'addExportNameForOutputs',
                  'mergeCustomProviderResources',
                  'stripNullPropsFromTemplateResources',
                  'saveServiceState',
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
      'package:cleanup': async () =>
        BbPromise.bind(this)
          .then(() => this.serverless.pluginManager.spawn('aws:common:validate'))
          .then(() => this.serverless.pluginManager.spawn('aws:common:cleanupTempDir')),

      'package:initialize': async () => this.generateCoreTemplate(),

      'package:setupProviderConfiguration': () => this.mergeIamTemplates(),

      'before:package:compileFunctions': async () =>
        BbPromise.bind(this).then(this.generateArtifactDirectoryName),

      'before:package:compileLayers': async () =>
        BbPromise.bind(this).then(this.generateArtifactDirectoryName),

      'package:finalize': async () =>
        BbPromise.bind(this).then(() =>
          this.serverless.pluginManager.spawn('aws:package:finalize')
        ),

      /**
       * Inner lifecycle hooks
       */

      // Package finalize inner lifecycle
      'aws:package:finalize:addExportNameForOutputs': () => {
        this.addExportNameForOutputs();
      },

      'aws:package:finalize:mergeCustomProviderResources': async () =>
        BbPromise.bind(this).then(this.mergeCustomProviderResources),

      'aws:package:finalize:stripNullPropsFromTemplateResources': () =>
        this.stripNullPropsFromTemplateResources(),

      'aws:package:finalize:saveServiceState': async () => {
        await this.saveCompiledTemplate();
        await this.saveServiceState();
        return this.serverless.pluginManager.spawn('aws:common:moveArtifactsToPackage');
      },
    };
  }
}

module.exports = AwsPackage;
