import _ from 'lodash'
import ServerlessError from '../../../serverless-error.js'
import writeServiceOutputs from '../../../cli/write-service-outputs.js'
import extendedValidate from './lib/extended-validate.js'
import setBucketName from '../lib/set-bucket-name.js'
import checkForChanges from './lib/check-for-changes.js'
import monitorStack from '../lib/monitor-stack.js'
import checkIfBucketExists from '../lib/check-if-bucket-exists.js'
import getCreateChangeSetParams from '../lib/get-create-change-set-params.js'
import getSharedStackActionParams from '../lib/get-shared-stack-action-params.js'
import getCreateStackParams from '../lib/get-create-stack-params.js'
import getUpdateStackParams from '../lib/get-update-stack-params.js'
import getExecuteChangeSetParams from '../lib/get-execute-change-set-params.js'
import waitForChangeSetCreation from '../lib/wait-for-change-set-creation.js'
import uploadZipFile from '../lib/upload-zip-file.js'
import createStack from './lib/create-stack.js'
import cleanupS3Bucket from './lib/cleanup-s3-bucket.js'
import uploadArtifacts from './lib/upload-artifacts.js'
import validateTemplate from './lib/validate-template.js'
import updateStack from '../lib/update-stack.js'
import ensureValidBucketExists from './lib/ensure-valid-bucket-exists.js'
import path from 'path'
import utils from '@serverlessinc/sf-core/src/utils.js'
import memoize from 'memoizee'
import DashboardObservabilityIntegrationService from '@serverlessinc/sf-core/src/lib/observability/dashboard/index.js'
import { determineObservabilityProviderFromConfig } from '../../observability/index.js'
import { ObservabilityProvider } from '@serverlessinc/sf-core/src/lib/observability/index.js'

const { log, style, progress } = utils

class AwsDeploy {
  constructor(serverless, options) {
    this.serverless = serverless
    this.options = options
    this.provider = this.serverless.getProvider('aws')
    this.servicePath = this.serverless.serviceDir || ''
    this.packagePath =
      this.options.package ||
      this.serverless.service.package.path ||
      path.join(this.servicePath, '.serverless')

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
      getSharedStackActionParams,
    )

    this.getFileStats = memoize(this.getFileStats.bind(this), { promise: true })

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
    }

    this.hooks = {
      initialize: () => {
        const isDeployCommand =
          this.serverless.processedInput.commands.join(' ') === 'deploy'
        if (isDeployCommand && !this.options.function) {
          const dashboardProviderName = _.get(
            this.provider.cachedCredentials,
            'dashboardProviderAlias',
          )
          log.notice(
            `Deploying "${this.serverless.service.service}" to stage "${this.serverless
              .getProvider('aws')
              .getStage()}" ${style.aside(
              `(${this.serverless.getProvider('aws').getRegion()}${
                dashboardProviderName
                  ? `, "${dashboardProviderName}" provider`
                  : ''
              })`,
            )}`,
          )

          // This is used to ensure that for `deploy` command, the `accountId` will be resolved and available
          // for `generatePayload` telemetry logic
          this.provider.getAccountId().then(
            (accountId) => (this.provider.accountId = accountId),
            () => {
              /* pass on all errors */
            },
          )
        }
      },

      'before:deploy:deploy': async () => {
        const mainProgress = progress.get('main')
        mainProgress.notice('Packaging')

        await this.serverless.pluginManager.spawn('aws:common:validate')

        const observabilityProvider = determineObservabilityProviderFromConfig(
          this.serverless.configurationInput,
          this.provider.getStage(),
        )
        const dashboardObservabilityEnabled =
          observabilityProvider === ObservabilityProvider.DASHBOARD
        const observabilityDisabled =
          observabilityProvider === ObservabilityProvider.DISABLED

        /**
         * If Dashboard observability is configured, whether enabled or not
         * make sure we setup the integration context to decide what to do next
         */
        if (dashboardObservabilityEnabled || observabilityDisabled) {
          this.dashboardObservabilityIntegrationService =
            await DashboardObservabilityIntegrationService(this.serverless)

          await this.dashboardObservabilityIntegrationService.configureIntegrationContext(
            { observabilityEnabled: dashboardObservabilityEnabled },
          )

          /**
           * Only create the integration (if it doesn't already exist) if observability is enabled
           */
          if (dashboardObservabilityEnabled) {
            await this.dashboardObservabilityIntegrationService.ensureIntegrationIsConfigured()
          }
        }

        if (!this.options.package && !this.serverless.service.package.path) {
          return this.extendedValidate()
        }
        await this.serverless.pluginManager.spawn(
          'aws:common:moveArtifactsToTemp',
        )
        return this.extendedValidate()
      },

      // Deploy outer lifecycle
      'deploy:deploy': async () =>
        this.serverless.pluginManager.spawn('aws:deploy:deploy'),

      'deploy:finalize': async () =>
        this.serverless.pluginManager.spawn('aws:deploy:finalize'),

      // Deploy deploy inner lifecycle
      'before:aws:deploy:deploy:createStack': () => {
        const mainProgress = progress.get('main')
        mainProgress.notice('Retrieving AWS CloudFormation stack')
      },
      'aws:deploy:deploy:createStack': async () => this.createStack(),

      'aws:deploy:deploy:checkForChanges': async () => {
        await this.ensureValidBucketExists()
        await this.checkForChanges()
        if (this.serverless.service.provider.shouldNotDeploy) return

        if (this.state.console) {
          throw new ServerlessError(
            'Cannot deploy service: Service was packaged with old ' +
              'Serverless Console integration, which is no longer supported',
            'CONSOLE_ACTIVATION_MISMATCH',
          )
        }
      },

      'before:aws:deploy:deploy:uploadArtifacts': () => {
        if (this.serverless.service.provider.shouldNotDeploy) return
        const mainProgress = progress.get('main')
        mainProgress.notice('Uploading')
      },
      'aws:deploy:deploy:uploadArtifacts': async () => {
        if (this.serverless.service.provider.shouldNotDeploy) return
        await this.uploadArtifacts()
      },

      'aws:deploy:deploy:validateTemplate': async () => {
        if (this.serverless.service.provider.shouldNotDeploy) return
        await this.validateTemplate()
      },

      'before:aws:deploy:deploy:updateStack': () => {
        if (this.serverless.service.provider.shouldNotDeploy) return
        const mainProgress = progress.get('main')
        mainProgress.notice('Updating AWS CloudFormation stack', {
          isMainEvent: true,
        })
      },
      'aws:deploy:deploy:updateStack': async () => {
        if (this.serverless.service.provider.shouldNotDeploy) return
        await this.updateStack()
      },

      'after:deploy:deploy': async () => {
        const mainProgress = progress.get('main')
        mainProgress.notice('Updating')

        const observabilityProvider = determineObservabilityProviderFromConfig(
          this.serverless.configurationInput,
          this.provider.getStage(),
        )
        /**
         * Enable or disable observability based on the configuration
         * This just returns and does nothing if there is no integration to begin with
         */
        if (
          observabilityProvider === ObservabilityProvider.DASHBOARD ||
          observabilityProvider === ObservabilityProvider.DISABLED
        ) {
          await this.dashboardObservabilityIntegrationService.instrumentService()
        }
      },

      // Deploy finalize inner lifecycle
      'aws:deploy:finalize:cleanup': async () => {
        if (this.serverless.service.provider.shouldNotDeploy) return
        await this.cleanupS3Bucket()
        if (this.options.package || this.serverless.service.package.path) {
          await this.serverless.pluginManager.spawn('aws:common:cleanupTempDir')
        }
      },

      error: async () => {
        if (this.serverless.processedInput.commands.join(' ') !== 'deploy') {
          return
        }
        log.error(
          `Stack ${serverless
            .getProvider('aws')
            .naming.getStackName()} failed to deploy ${style.aside(
            `(${Math.floor(
              (Date.now() - this.serverless.pluginManager.commandRunStartTime) /
                1000,
            )}s)`,
          )}`,
        )
      },

      finalize: async () => {
        if (this.serverless.processedInput.commands.join(' ') !== 'deploy') {
          return
        }
        if (this.serverless.service.provider.shouldNotDeploy) {
          log.aside(
            `No changes to deploy. Deployment skipped. ${style.aside(
              `(${Math.floor(
                (Date.now() -
                  this.serverless.pluginManager.commandRunStartTime) /
                  1000,
              )}s)`,
            )}`,
          )
          return
        }

        if (this.serverless.service.provider.deploymentWithEmptyChangeSet) {
          log.aside(
            `Change set did not include any changes to be deployed. ${style.aside(
              `(${Math.floor(
                (Date.now() -
                  this.serverless.pluginManager.commandRunStartTime) /
                  1000,
              )}s)`,
            )}`,
          )
          return
        }

        log.success(
          `Service deployed to stack ${this.serverless
            .getProvider('aws')
            .naming.getStackName()} ${style.aside(
            `(${Math.floor(
              (Date.now() - this.serverless.pluginManager.commandRunStartTime) /
                1000,
            )}s)`,
          )}`,
        )

        const mainProgress = progress.get('main')
        mainProgress.remove()

        writeServiceOutputs(this.serverless.serviceOutputs)
        writeServiceOutputs(this.serverless.servicePluginOutputs)

        if (this.options['enforce-hash-update']) {
          log.blankLine()
          log.notice(
            'Your service has been deployed with new hashing algorithm. Please remove "provider.lambdaHashingVersion" from your service configuration and re-deploy without "--enforce-hash-update" flag to restore function descriptions.',
          )
        }
      },
    }
  }
}

export default AwsDeploy
