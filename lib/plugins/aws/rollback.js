import validate from './lib/validate.js'
import setBucketName from './lib/set-bucket-name.js'
import updateStack from './lib/update-stack.js'
import monitorStack from './lib/monitor-stack.js'
import waitForChangeSetCreation from './lib/wait-for-change-set-creation.js'
import getCreateChangeSetParams from './lib/get-create-change-set-params.js'
import getExecuteChangeSetParams from './lib/get-execute-change-set-params.js'
import getSharedStackActionParams from './lib/get-shared-stack-action-params.js'
import getCreateStackParams from './lib/get-create-stack-params.js'
import getUpdateStackParams from './lib/get-update-stack-params.js'
import findAndGroupDeployments from './utils/find-and-group-deployments.js'
import ServerlessError from '../../serverless-error.js'
import utils from '@serverlessinc/sf-core/src/utils.js'

const { log, progress, style } = utils

class AwsRollback {
  constructor(serverless, options) {
    this.serverless = serverless
    this.options = options
    this.provider = this.serverless.getProvider('aws')

    const mainProgress = progress.get('main')

    Object.assign(
      this,
      validate,
      setBucketName,
      updateStack,
      monitorStack,
      waitForChangeSetCreation,
      getCreateChangeSetParams,
      getExecuteChangeSetParams,
      getCreateStackParams,
      getUpdateStackParams,
      getSharedStackActionParams,
    )

    this.hooks = {
      'before:rollback:initialize': async () => this.validate(),

      'rollback:rollback': async () => {
        if (!this.options.timestamp) {
          log.notice(
            'Select a "timestamp" from the deploy list below and run "sls rollback -t <timestamp>" to rollback your service to a specific version.',
          )
          await this.serverless.pluginManager.spawn('deploy:list')
          return
        }

        log.notice(
          `Rolling back ${this.serverless.service.service} to timestamp "${this.options.timestamp}"`,
        )

        log.info() // Ensure gap between verbose logging

        mainProgress.notice('Validating')
        await this.setBucketName()
        await this.setStackToUpdate()

        mainProgress.notice('Updating AWS CloudFormation stack')
        const result = await this.updateStack()

        if (result) {
          log.success(
            `Service rolled back to timestamp "${
              this.options.timestamp
            }" ${style.aside(
              `(${Math.floor(
                (Date.now() -
                  this.serverless.pluginManager.commandRunStartTime) /
                  1000,
              )}s)`,
            )}`,
          )
        } else {
          log.aside(
            `No updates to be performed. Rollback skipped. ${style.aside(
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

  async setStackToUpdate() {
    const logger = log.get('console')
    const service = this.serverless.service
    const serviceName = this.serverless.service.service
    const stage = this.provider.getStage()
    const deploymentPrefix = this.provider.getDeploymentPrefix()
    const prefix = `${deploymentPrefix}/${serviceName}/${stage}`

    let response
    try {
      response = await this.provider.request('S3', 'listObjectsV2', {
        Bucket: this.bucketName,
        Prefix: prefix,
      })
    } catch (err) {
      if (err.code === 'AWS_S3_LIST_OBJECTS_V2_ACCESS_DENIED') {
        throw new ServerlessError(
          'Could not list objects in the deployment bucket. Make sure you have sufficient permissions to access it.',
          err.code,
        )
      }
      throw err
    }

    const deployments = findAndGroupDeployments(
      response,
      deploymentPrefix,
      serviceName,
      stage,
    )

    if (deployments.length === 0) {
      const msg = "Couldn't find any existing deployments."
      const hint = 'Please verify that stage and region are correct.'
      throw new ServerlessError(
        `${msg} ${hint}`,
        'ROLLBACK_DEPLOYMENTS_NOT_FOUND',
      )
    }

    let date = new Date(this.options.timestamp)

    // The if below is added due issues#5664 - Check it for more details
    if (date instanceof Date === false || isNaN(date.valueOf())) {
      date = new Date(Number(this.options.timestamp))
    }

    const dateString = `${date.getTime().toString()}-${date.toISOString()}`
    const exists = deployments.some((deployment) =>
      deployment.some(
        (item) =>
          item.directory === dateString &&
          item.file === this.provider.naming.getCompiledTemplateS3Suffix(),
      ),
    )

    if (!exists) {
      const msg = `Couldn't find a deployment for the timestamp: ${this.options.timestamp}.`
      const hint =
        'Please verify that the timestamp, stage and region are correct.'
      throw new ServerlessError(
        `${msg} ${hint}`,
        'ROLLBACK_DEPLOYMENT_NOT_FOUND',
      )
    }

    service.package.artifactDirectoryName = `${prefix}/${dateString}`
    const stateString = await (async () => {
      try {
        return (
          await this.provider.request('S3', 'getObject', {
            Bucket: this.bucketName,
            Key: `${
              service.package.artifactDirectoryName
            }/${this.provider.naming.getServiceStateFileName()}`,
          })
        ).Body
      } catch (error) {
        if (error.code === 'AWS_S3_GET_OBJECT_NO_SUCH_KEY') return null
        throw error
      }
    })()
    const state = stateString ? JSON.parse(stateString) : {}
    logger.debug('resolved state %o', state)
    if (state.console) {
      throw new ServerlessError(
        'Cannot rollback deployment: Target deployment was packaged with old ' +
          'Serverless Console integration, which is no longer supported',
        'CONSOLE_ACTIVATION_MISMATCH_ROLLBACK',
      )
    }
  }
}

export default AwsRollback
