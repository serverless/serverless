'use strict';

const path = require('path');
const mergeCustomProviderResources = require('./lib/merge-custom-provider-resources');
const stripNullPropsFromTemplateResources = require('./lib/strip-null-props-from-template-resources');
const generateArtifactDirectoryName = require('./lib/generate-artifact-directory-name');
const generateCoreTemplate = require('./lib/generate-core-template');
const saveServiceState = require('./lib/save-service-state');
const saveCompiledTemplate = require('./lib/save-compiled-template');
const mergeIamTemplates = require('./lib/merge-iam-templates');
const addExportNameForOutputs = require('./lib/add-export-name-for-outputs');
const { log, style, progress } = require('@serverless/utils/log');

const mainProgress = progress.get('main');

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
      'initialize': () => {
        if (this.serverless.processedInput.commands.join(' ') === 'package') {
          log.notice();
          log.notice(
            `Packaging ${this.serverless.service.service} for stage ${this.serverless
              .getProvider('aws')
              .getStage()} ${style.aside(`(${this.serverless.getProvider('aws').getRegion()})`)}`
          );
          log.info(); // Ensure gap between verbose logging
        }
      },
      'before:package:cleanup': () => mainProgress.notice('Packaging', { isMainEvent: true }),
      /**
       * Outer lifecycle hooks
       */
      'package:cleanup': async () => {
        await this.serverless.pluginManager.spawn('aws:common:validate');
        await this.serverless.pluginManager.spawn('aws:common:cleanupTempDir');
      },

      'package:initialize': async () => {
        return this.generateCoreTemplate();
      },

      'package:setupProviderConfiguration': () => this.mergeIamTemplates(),

      'before:package:compileFunctions': async () => this.generateArtifactDirectoryName(),

      'before:package:compileLayers': async () => this.generateArtifactDirectoryName(),

      'package:finalize': async () => this.serverless.pluginManager.spawn('aws:package:finalize'),

      /**
       * Inner lifecycle hooks
       */

      // Package finalize inner lifecycle
      'aws:package:finalize:addExportNameForOutputs': () => {
        this.addExportNameForOutputs();
      },

      'aws:package:finalize:mergeCustomProviderResources': async () =>
        this.mergeCustomProviderResources(),

      'aws:package:finalize:stripNullPropsFromTemplateResources': () =>
        this.stripNullPropsFromTemplateResources(),

      'aws:package:finalize:saveServiceState': async () => {
        await this.saveCompiledTemplate();
        await this.saveServiceState();
        return this.serverless.pluginManager.spawn('aws:common:moveArtifactsToPackage');
      },

      'finalize': () => {
        if (this.serverless.processedInput.commands.join(' ') === 'package') {
          log.notice();
          log.notice.success(
            `Service packaged ${style.aside(
              `(${Math.floor(
                (Date.now() - this.serverless.pluginManager.commandRunStartTime) / 1000
              )}s)`
            )}`
          );
        }
      },
    };
  }
}

module.exports = AwsPackage;
