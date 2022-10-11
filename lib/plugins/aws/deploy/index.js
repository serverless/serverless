'use strict';

const _ = require('lodash');
const ServerlessError = require('../../../serverless-error');
const writeServiceOutputs = require('../../../cli/write-service-outputs');
const extendedValidate = require('./lib/extended-validate');
const setBucketName = require('../lib/set-bucket-name');
const checkForChanges = require('./lib/check-for-changes');
const monitorStack = require('../lib/monitor-stack');
const checkIfBucketExists = require('../lib/check-if-bucket-exists');
const getCreateChangeSetParams = require('../lib/get-create-change-set-params');
const getSharedStackActionParams = require('../lib/get-shared-stack-action-params');
const getCreateStackParams = require('../lib/get-create-stack-params');
const getUpdateStackParams = require('../lib/get-update-stack-params');
const getExecuteChangeSetParams = require('../lib/get-execute-change-set-params');
const waitForChangeSetCreation = require('../lib/wait-for-change-set-creation');
const uploadZipFile = require('../lib/upload-zip-file');
const createStack = require('./lib/create-stack');
const cleanupS3Bucket = require('./lib/cleanup-s3-bucket');
const uploadArtifacts = require('./lib/upload-artifacts');
const validateTemplate = require('./lib/validate-template');
const updateStack = require('../lib/update-stack');
const ensureValidBucketExists = require('./lib/ensure-valid-bucket-exists');
const path = require('path');
const { style, log, progress, writeText } = require('@serverless/utils/log');
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
      ensureValidBucketExists,
      uploadArtifacts,
      validateTemplate,
      updateStack,
      monitorStack,
      checkIfBucketExists,
      waitForChangeSetCreation,
      uploadZipFile,
      getCreateChangeSetParams,
      getCreateStackParams,
      getExecuteChangeSetParams,
      getUpdateStackParams,
      getSharedStackActionParams
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
          const dashboardProviderName = _.get(
            this.provider.cachedCredentials,
            'dashboardProviderAlias'
          );
          log.notice();
          log.notice(
            `Deploying ${this.serverless.service.service} to stage ${this.serverless
              .getProvider('aws')
              .getStage()} ${style.aside(
              `(${this.serverless.getProvider('aws').getRegion()}${
                dashboardProviderName ? `, "${dashboardProviderName}" provider` : ''
              })`
            )}`
          );
          log.info(); // Ensure gap between verbose logging

          // This is used to ensure that for `deploy` command, the `accountId` will be resolved and available
          // for `generatePayload` telemetry logic
          this.provider.getAccountId().then(
            (accountId) => (this.provider.accountId = accountId),
            () => {
              /* pass on all errors */
            }
          );
        }
      },

      'before:deploy:deploy': async () => {
        await this.serverless.pluginManager.spawn('aws:common:validate');

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
        mainProgress.notice('Retrieving CloudFormation stack', { isMainEvent: true }),
      'aws:deploy:deploy:createStack': async () => this.createStack(),

      'aws:deploy:deploy:checkForChanges': async () => {
        await this.ensureValidBucketExists();
        await this.checkForChanges();
        if (this.serverless.service.provider.shouldNotDeploy) return;

        if (this.state.console) {
          throw new ServerlessError(
            'Cannot deploy service: Service was packaged with old ' +
              'Serverless Console integration, which is no longer supported',
            'CONSOLE_ACTIVATION_MISMATCH'
          );
        }
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

      'error': async () => {
        if (this.serverless.processedInput.commands.join(' ') !== 'deploy') return;
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
      },

      'finalize': async () => {
        if (this.serverless.processedInput.commands.join(' ') !== 'deploy') return;
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

        if (this.serverless.service.provider.deploymentWithEmptyChangeSet) {
          log.notice();
          log.notice.skip(
            `Change set did not include any changes to be deployed. ${style.aside(
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
        writeText();
        writeServiceOutputs(this.serverless.serviceOutputs);
        writeServiceOutputs(this.serverless.servicePluginOutputs);

        if (this.options['enforce-hash-update']) {
          log.notice();
          log.notice(
            'Your service has been deployed with new hashing algorithm. Please remove "provider.lambdaHashingVersion" from your service configuration and re-deploy without "--enforce-hash-update" flag to restore function descriptions.'
          );
        }
      },
    };
  }
}

module.exports = AwsDeploy;
