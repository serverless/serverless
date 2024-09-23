import _ from 'lodash'
import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc.js'
import wait from 'timers-ext/promise/sleep.js'
import utils from '@serverlessinc/sf-core/src/utils.js'
import validate from './lib/validate.js'
import formatLambdaLogEvent from './utils/format-lambda-log-event.js'
import ServerlessError from '../../serverless-error.js'

const { style } = utils

dayjs.extend(utc)

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
    const lambdaName = this.serverless.service.getFunction(
      this.options.function,
    ).name
    this.options.interval = this.options.interval || 1000
    this.options.logGroupName = this.provider.naming.getLogGroupName(lambdaName)
  }

  async getLogStreams() {
    const params = {
      logGroupName: this.options.logGroupName,
      descending: true,
      limit: 50,
      orderBy: 'LastEventTime',
    }

    const reply = await this.provider.request(
      'CloudWatchLogs',
      'describeLogStreams',
      params,
    )
    if (!reply || reply.logStreams.length === 0) {
      throw new ServerlessError(
        'No existing streams for the function',
        'NO_EXISTING_LOG_STREAMS',
        { stack: false },
      )
    }

    return reply.logStreams.map((logStream) => logStream.logStreamName)
  }

  /**
   * Show logs
   * @param {Array} logStreamNames - Array of log stream names
   * @returns {Promise}
   */
  async showLogs(logStreamNames) {
    if (!logStreamNames || !logStreamNames.length) {
      if (this.options.tail) {
        const newLogStreamNames = await this.getLogStreams()
        await this.showLogs(newLogStreamNames)
      }
    }

    const params = {
      logGroupName: this.options.logGroupName,
      interleaved: true,
      logStreamNames,
      startTime: this.options.startTime,
    }

    if (this.options.filter) params.filterPattern = this.options.filter
    if (this.options.nextToken) params.nextToken = this.options.nextToken
    if (this.options.startTime) {
      const since =
        ['m', 'h', 'd'].indexOf(
          this.options.startTime[this.options.startTime.length - 1],
        ) !== -1
      if (since) {
        params.startTime = dayjs()
          .subtract(
            this.options.startTime.replace(/\D/g, ''),
            this.options.startTime.replace(/\d/g, ''),
          )
          .valueOf()
      } else {
        params.startTime = dayjs.utc(this.options.startTime).valueOf()
      }
    } else {
      params.startTime = dayjs().subtract(10, 'm').valueOf()
      if (this.options.tail) {
        params.startTime = dayjs().subtract(15, 's').valueOf()
      }
    }

    const results = await this.provider.request(
      'CloudWatchLogs',
      'filterLogEvents',
      params,
    )

    const startTimeHumanReadable = dayjs(params.startTime).format(
      'YYYY-MM-DD HH:mm:ss',
    )

    // Remove progress before printing results
    this.progress.remove()

    // If not tailing, and no logs found, show a message
    if (!this.options.tail && (!results.events || !results.events.length)) {
      this.logger.aside(
        `No logs found from start time: ${startTimeHumanReadable}`,
      )
      return
    }

    // If logs found
    if (results.events && results.events.length) {
      if (!this.options.tail) {
        this.logger.aside(`Logs Start Time: ${startTimeHumanReadable}`)
        this.logger.blankLine()
      }

      // Print log messages w/ custom formatting
      results.events.forEach((e) => {
        this.logger.notice(formatLambdaLogEvent(e.message))
      })
    }

    if (results.nextToken) {
      this.options.nextToken = results.nextToken
    } else {
      delete this.options.nextToken
    }

    if (this.options.tail) {
      // Set listening message
      this.progress.notice(`Listening ${style.aside(startTimeHumanReadable)}`)

      if (results.events && results.events.length) {
        this.options.startTime = _.last(results.events).timestamp + 1
      }

      await wait(this.options.interval)
      const newLogStreamNames = await this.getLogStreams()
      await this.showLogs(newLogStreamNames)
    }
  }
}

export default AwsLogs
