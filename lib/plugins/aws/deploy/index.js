'use strict';

const writeServiceOutputs = require('../../../cli/write-service-outputs');
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
const { style, log, progress } = require('@serverless/utils/log');
const memoize = require('memoizee');

const mainProgress = progress.get('main');

class AwsDeploy {
  constructor(serverless, options) {
    this.serverless = serverless;
    this.options = options;
    this.provider = this.serverless.getProvider('aws');
    this.servicePath = this.serverless.serviceDir || '';
    this.packagePath =
      this.options.package ||
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

    this.getFileStats = memoize(this.getFileStats.bind(this), { promise: true });

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
                lifecycleEvents: ['cleanup'],
              },
            },
          },
        },
      },
    };

    this.hooks = {
      'initialize': () => {
        const isDeployCommand = this.serverless.processedInput.commands.join(' ') === 'deploy';
        if (isDeployCommand && !this.options.function) {
          log.notice();
          log.notice(
            `Deploying ${this.serverless.service.service} to stage ${this.serverless
              .getProvider('aws')
              .getStage()} ${style.aside(`(${this.serverless.getProvider('aws').getRegion()})`)}`
          );
          log.info(); // Ensure gap between verbose logging
        }
      },

      'before:deploy:deploy': async () => {
        await this.serverless.pluginManager.spawn('aws:common:validate');

        const bucketName = this.serverless.service.provider.deploymentBucket;
        if (bucketName) {
          await this.existsDeploymentBucket(bucketName);
        }

        if (!this.options.package && !this.serverless.service.package.path) {
          return this.extendedValidate();
        }
        await this.serverless.pluginManager.spawn('aws:common:moveArtifactsToTemp');
        return this.extendedValidate();
      },

      // Deploy outer lifecycle
      'deploy:deploy': async () => this.serverless.pluginManager.spawn('aws:deploy:deploy'),

      'deploy:finalize': async () => this.serverless.pluginManager.spawn('aws:deploy:finalize'),

      // Deploy deploy inner lifecycle
      'before:aws:deploy:deploy:createStack': () =>
        mainProgress.notice('Retrieving CloudFormation stack info', { isMainEvent: true }),
      'aws:deploy:deploy:createStack': async () => this.createStack(),

      'aws:deploy:deploy:checkForChanges': async () => {
        await this.setBucketName();
        await this.checkForChanges();
      },

      'before:aws:deploy:deploy:uploadArtifacts': () => {
        if (this.serverless.service.provider.shouldNotDeploy) return;
        mainProgress.notice('Uploading', { isMainEvent: true });
      },
      'aws:deploy:deploy:uploadArtifacts': async () => {
        if (this.serverless.service.provider.shouldNotDeploy) return;
        await this.uploadArtifacts();
      },

      'aws:deploy:deploy:validateTemplate': async () => {
        if (this.serverless.service.provider.shouldNotDeploy) return;
        await this.validateTemplate();
      },

      'before:aws:deploy:deploy:updateStack': () => {
        if (this.serverless.service.provider.shouldNotDeploy) return;
        mainProgress.notice('Updating CloudFormation stack', { isMainEvent: true });
      },
      'aws:deploy:deploy:updateStack': async () => {
        if (this.serverless.service.provider.shouldNotDeploy) return;
        await this.updateStack();
      },

      'after:deploy:deploy': () => mainProgress.notice('Updating'),

      // Deploy finalize inner lifecycle
      'aws:deploy:finalize:cleanup': async () => {
        if (this.serverless.service.provider.shouldNotDeploy) return;
        await this.cleanupS3Bucket();
        if (this.options.package || this.serverless.service.package.path) {
          await this.serverless.pluginManager.spawn('aws:common:cleanupTempDir');
        }
      },

      'error': () => {
        const isDeployCommand =
          this.serverless.processedInput.commands.length === 1 &&
          this.serverless.processedInput.commands[0] === 'deploy';
        if (isDeployCommand && !this.options.function) {
          log.error(); // In order to ensure extra new line before the error message
          log.error(
            `Stack ${serverless
              .getProvider('aws')
              .naming.getStackName()} failed to deploy ${style.aside(
              `(${Math.floor(
                (Date.now() - this.serverless.pluginManager.commandRunStartTime) / 1000
              )}s)`
            )}`
          );
        }
      },

      'finalize': () => {
        if (this.serverless.processedInput.commands.join(' ') !== 'deploy') return;
        if (this.options.function) return;
        if (this.serverless.service.provider.shouldNotDeploy) {
          log.notice();
          log.notice.skip(
            `No changes to deploy. Deployment skipped. ${style.aside(
              `(${Math.floor(
                (Date.now() - this.serverless.pluginManager.commandRunStartTime) / 1000
              )}s)`
            )}`
          );
          return;
        }
        log.notice();
        log.notice.success(
          `Service deployed to stack ${this.serverless
            .getProvider('aws')
            .naming.getStackName()} ${style.aside(
            `(${Math.floor(
              (Date.now() - this.serverless.pluginManager.commandRunStartTime) / 1000
            )}s)`
          )}`
        );
        if (this.serverless.serviceOutputs) writeServiceOutputs(this.serverless.serviceOutputs);
      },
    };
  }
}

module.exports = AwsDeploy;
