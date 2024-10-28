import validate from '../lib/validate.js'
import checkIfBucketExists from '../lib/check-if-bucket-exists.js'
import emptyS3Bucket from './lib/bucket.js'
import removeStack from './lib/stack.js'
import removeEcrRepository from './lib/ecr.js'
import monitorStack from '../lib/monitor-stack.js'
import checkIfEcrRepositoryExists from '../lib/check-if-ecr-repository-exists.js'
import utils from '@serverlessinc/sf-core/src/utils.js'

const { log, style, progress } = utils
const mainProgress = progress.get('main')

class AwsRemove {
  constructor(serverless, options) {
    this.serverless = serverless
    this.options = options || {}
    this.provider = this.serverless.getProvider('aws')

    Object.assign(
      this,
      validate,
      emptyS3Bucket,
      removeStack,
      monitorStack,
      removeEcrRepository,
      checkIfEcrRepositoryExists,
      checkIfBucketExists,
    )

    this.hooks = {
      initialize: async () => {
        if (this.serverless.processedInput.commands.join(' ') === 'remove') {
          log.notice(
            `Removing "${
              this.serverless.service.service
            }" from stage "${this.serverless
              .getProvider('aws')
              .getStage()}" ${style.aside(
              `(${this.serverless.getProvider('aws').getRegion()})`,
            )}`,
          )

          // This is used to ensure that for `remove` command, the `accountId` will be resolved and available
          // for `generatePayload` telemetry logic
          this.provider.getAccountId().then(
            (accountId) => (this.provider.accountId = accountId),
            () => {
              /* pass on all errors */
            },
          )
        }
      },

      'remove:remove': async () => {
        const doesEcrRepositoryExistPromise = this.checkIfEcrRepositoryExists()
        await this.validate()
        mainProgress.notice('Removing objects from S3 bucket', {
          isMainEvent: true,
        })
        await this.emptyS3Bucket()
        mainProgress.notice('Removing AWS CloudFormation stack', {
          isMainEvent: true,
        })
        const cfData = await this.removeStack()
        await this.monitorStack('delete', cfData)
        if (await doesEcrRepositoryExistPromise) {
          mainProgress.notice('Removing ECR repository', { isMainEvent: true })
          await this.removeEcrRepository()
        }
      },

      finalize: async () => {
        if (this.serverless.processedInput.commands.join(' ') !== 'remove')
          return
        log.success(
          `Service ${
            this.serverless.service.service
          } has been successfully removed ${style.aside(
            `(${Math.floor(
              (Date.now() - this.serverless.pluginManager.commandRunStartTime) /
                1000,
            )}s)`,
          )}`,
        )
      },
    }
  }
}

export default AwsRemove
