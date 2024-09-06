import path from 'path'
import mergeCustomProviderResources from './lib/merge-custom-provider-resources.js'
import stripNullPropsFromTemplateResources from './lib/strip-null-props-from-template-resources.js'
import generateArtifactDirectoryName from './lib/generate-artifact-directory-name.js'
import generateCoreTemplate from './lib/generate-core-template.js'
import saveServiceState from './lib/save-service-state.js'
import saveCompiledTemplate from './lib/save-compiled-template.js'
import mergeIamTemplates from './lib/merge-iam-templates.js'
import addExportNameForOutputs from './lib/add-export-name-for-outputs.js'
import validateTemplate from './lib/validate-template.js'
import setBucketName from '../lib/set-bucket-name.js'
import utils from '@serverlessinc/sf-core/src/utils.js'

const { log, style, progress } = utils

class AwsPackage {
  constructor(serverless, options, pluginUtils) {
    this.serverless = serverless
    this.options = options
    this.servicePath = this.serverless.serviceDir || ''
    this.packagePath =
      this.options.package ||
      this.serverless.service.package.path ||
      path.join(this.servicePath || '.', '.serverless')
    this.provider = this.serverless.getProvider('aws')
    this.progress = pluginUtils.progress

    Object.assign(
      this,
      generateCoreTemplate,
      mergeIamTemplates,
      generateArtifactDirectoryName,
      addExportNameForOutputs,
      mergeCustomProviderResources,
      stripNullPropsFromTemplateResources,
      saveServiceState,
      saveCompiledTemplate,
      validateTemplate,
      setBucketName,
    )

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
    }

    this.hooks = {
      initialize: () => {
        // TODO: When addressing https://github.com/serverless/serverless/issues/8666
        //       unify with this.serverless.service.package.artifactDirectoryName
        // Assign here, so it's accessible in context of all commands
        this.serverless.service.package.artifactsS3KeyDirname = `${this.provider.getDeploymentPrefix()}/${
          this.serverless.service.service
        }/${this.provider.getStage()}/code-artifacts`
        if (this.serverless.processedInput.commands.join(' ') === 'package') {
          log.notice(
            `Packaging "${
              this.serverless.service.service
            }" for stage "${this.serverless
              .getProvider('aws')
              .getStage()}" ${style.aside(
              `(${this.serverless.getProvider('aws').getRegion()})`,
            )}`,
          )
        }
      },

      'before:package:cleanup': () => {
        this.progress.notice('Packaging')
      },

      /**
       * Outer lifecycle hooks
       */
      'package:cleanup': async () => {
        await this.serverless.pluginManager.spawn('aws:common:validate')
        await this.serverless.pluginManager.spawn('aws:common:cleanupTempDir')
      },

      'package:initialize': async () => {
        await this.setBucketName()
        return this.generateCoreTemplate()
      },

      'package:setupProviderConfiguration': () => this.mergeIamTemplates(),

      'before:package:compileFunctions': async () =>
        this.generateArtifactDirectoryName(),

      'before:package:compileLayers': async () =>
        this.generateArtifactDirectoryName(),

      'package:finalize': async () =>
        this.serverless.pluginManager.spawn('aws:package:finalize'),

      /**
       * Inner lifecycle hooks
       */

      // Package finalize inner lifecycle
      'aws:package:finalize:addExportNameForOutputs': () => {
        this.addExportNameForOutputs()
      },

      'aws:package:finalize:mergeCustomProviderResources': async () =>
        this.mergeCustomProviderResources(),

      'aws:package:finalize:stripNullPropsFromTemplateResources': () =>
        this.stripNullPropsFromTemplateResources(),

      'aws:package:finalize:saveServiceState': async () => {
        this.validateTemplate()
        await this.saveCompiledTemplate()
        await this.saveServiceState()
        return this.serverless.pluginManager.spawn(
          'aws:common:moveArtifactsToPackage',
        )
      },

      finalize: () => {
        if (this.serverless.processedInput.commands.join(' ') === 'package') {
          log.success(
            `Service packaged ${style.aside(
              `(${Math.floor(
                (Date.now() -
                  this.serverless.pluginManager.commandRunStartTime) /
                  1000,
              )}s)`,
            )}`,
          )
        }
      },
    }
  }
}

export default AwsPackage
