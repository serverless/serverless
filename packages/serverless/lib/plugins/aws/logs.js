import validate from './lib/validate.js'
import { getLogStreamNames, showLogEvents } from './lib/log-streams.js'
import { LOG_GROUP_CLASSES } from './lib/naming.js'
import ServerlessError from '../../serverless-error.js'

class AwsLogs {
  constructor(serverless, options, pluginUtils) {
    this.serverless = serverless
    this.options = options || {}
    this.provider = this.serverless.getProvider('aws')
    this.logger = pluginUtils.log
    this.progress = pluginUtils.progress

    Object.assign(this, validate)

    this.hooks = {
      'logs:logs': async () => {
        // Ensure at least one of --function, --agent, --sandbox, or --web-app is provided
        if (
          !this.options.function &&
          !this.options.agent &&
          !this.options.sandbox &&
          !this.options['web-app']
        ) {
          throw new ServerlessError(
            'One of the required options must be provided: --function (-f), --agent (-a), --sandbox, or --web-app',
            'LOGS_MISSING_OPTION',
            { stack: false },
          )
        }

        // Checked here, in the first hook to run, so that no other target's plugin runs first
        if (
          this.options['web-app'] &&
          (this.options.function || this.options.agent || this.options.sandbox)
        ) {
          throw new ServerlessError(
            'Cannot combine --web-app with --function, --agent or --sandbox.',
            'LOGS_MUTUAL_EXCLUSIVITY',
            { stack: false },
          )
        }

        // Skip if --agent, --sandbox or --web-app is provided (handled by their dedicated plugins)
        if (
          this.options.agent ||
          this.options.sandbox ||
          this.options['web-app']
        ) {
          return
        }

        if (!this.options.tail) {
          this.progress.notice('Fetching logs')
        } else {
          this.logger.aside(
            `Streaming new logs for function: "${this.options.function}"`,
          )
          this.progress.notice('Listening')
        }
        this.extendedValidate()
        const logStreamNames = await this.getLogStreams()
        await this.showLogs(logStreamNames)
      },
    }
  }

  extendedValidate() {
    this.validate()
    // validate function exists in service
    const functionObject = this.serverless.service.getFunction(
      this.options.function,
    )
    const lambdaName = functionObject.name
    this.options.interval = this.options.interval || 1000
    const logGroupClass = this.provider.getLogGroupClass(functionObject)
    this.options.logGroupName = this.provider.naming.getLogGroupName(
      lambdaName,
      { logGroupClass },
    )
    if (logGroupClass === LOG_GROUP_CLASSES.INFREQUENT_ACCESS) {
      throw new ServerlessError(
        `The "${this.options.function}" function writes to the INFREQUENT_ACCESS log group "${this.options.logGroupName}". This log class does not support the CloudWatch Logs APIs used by "sls logs". Use CloudWatch Logs Insights to read these logs.`,
        'LOGS_INFREQUENT_ACCESS_NOT_SUPPORTED',
        { stack: false },
      )
    }
  }

  getLogStreams() {
    return getLogStreamNames({
      provider: this.provider,
      logGroupName: this.options.logGroupName,
      noLogStreamsMessage: 'No existing streams for the function',
    })
  }

  /**
   * Show logs
   * @param {Array} logStreamNames - Array of log stream names
   * @returns {Promise}
   */
  showLogs(logStreamNames) {
    return showLogEvents({
      provider: this.provider,
      logger: this.logger,
      progress: this.progress,
      options: this.options,
      logGroupName: this.options.logGroupName,
      logStreamNames,
      getLogStreams: () => this.getLogStreams(),
    })
  }
}

export default AwsLogs
