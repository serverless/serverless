import _ from 'lodash'
import dayjs from 'dayjs'
import validate from './lib/validate.js'
import utils from '@serverlessinc/sf-core/src/utils.js'
import LocalizedFormat from 'dayjs/plugin/localizedFormat.js'

const { writeText, style } = utils
dayjs.extend(LocalizedFormat)

class AwsMetrics {
  constructor(serverless, options, pluginUtils) {
    this.serverless = serverless
    this.options = options
    this.provider = this.serverless.getProvider('aws')
    this.logger = pluginUtils.log
    this.progress = pluginUtils.progress

    Object.assign(this, validate)

    this.hooks = {
      'metrics:metrics': async () => {
        this.progress.notice('Fetching service metrics')
        this.extendedValidate()
        const metrics = await this.getMetrics()
        this.showMetrics(metrics)
      },
    }
  }

  extendedValidate() {
    this.validate()

    const today = new Date()
    const yesterday = dayjs().subtract(1, 'day').toDate()

    if (this.options.startTime) {
      const sinceDateMatch = this.options.startTime.match(/(\d+)(m|h|d)/)
      if (sinceDateMatch) {
        this.options.startTime = dayjs()
          .subtract(sinceDateMatch[1], sinceDateMatch[2])
          .valueOf()
      }
    }

    // finally create a new date object
    this.options.startTime = new Date(this.options.startTime || yesterday)
    this.options.endTime = new Date(this.options.endTime || today)
  }

  async getMetrics() {
    const StartTime = this.options.startTime
    const EndTime = this.options.endTime
    const hoursDiff = Math.abs(EndTime - StartTime) / 36e5
    const Period = hoursDiff > 24 ? 3600 * 24 : 3600
    const functions = this.options.function
      ? [this.serverless.service.getFunction(this.options.function).name]
      : this.serverless.service.getAllFunctionsNames()

    return Promise.all(
      functions.map(async (functionName) => {
        const commonParams = {
          StartTime,
          EndTime,
          Namespace: 'AWS/Lambda',
          Period,
          Dimensions: [{ Name: 'FunctionName', Value: functionName }],
        }

        const invocationsParams = _.merge({}, commonParams, {
          MetricName: 'Invocations',
          Statistics: ['Sum'],
          Unit: 'Count',
        })
        const throttlesParams = _.merge({}, commonParams, {
          MetricName: 'Throttles',
          Statistics: ['Sum'],
          Unit: 'Count',
        })
        const errorsParams = _.merge({}, commonParams, {
          MetricName: 'Errors',
          Statistics: ['Sum'],
          Unit: 'Count',
        })
        const averageDurationParams = _.merge({}, commonParams, {
          MetricName: 'Duration',
          Statistics: ['Average'],
          Unit: 'Milliseconds',
        })

        const getMetrics = (params) =>
          this.provider.request('CloudWatch', 'getMetricStatistics', params)

        return Promise.all([
          getMetrics(invocationsParams),
          getMetrics(throttlesParams),
          getMetrics(errorsParams),
          getMetrics(averageDurationParams),
        ])
      }),
    )
  }

  showMetrics(metrics) {
    const modernMessageTokens = []

    this.progress.remove()

    if (this.options.function) {
      this.logger.notice(`Function Metrics: "${this.options.function}"`)
    } else {
      this.logger.notice('Service Metrics')
    }

    const formattedStartTime = dayjs(this.options.startTime).format('LLL')
    const formattedEndTime = dayjs(this.options.endTime).format('LLL')
    this.logger.aside(`${formattedStartTime} - ${formattedEndTime}`)

    this.logger.blankLine()

    if (metrics && metrics.length > 0) {
      const getDatapointsByLabel = (Label) =>
        metrics
          .flat()
          .filter((metric) => metric.Label === Label)
          .map((metric) => metric.Datapoints)
          .flat()

      const invocationsCount = _.sumBy(
        getDatapointsByLabel('Invocations'),
        'Sum',
      )
      const throttlesCount = _.sumBy(getDatapointsByLabel('Throttles'), 'Sum')
      const errorsCount = _.sumBy(getDatapointsByLabel('Errors'), 'Sum')
      const durationAverage =
        _.meanBy(getDatapointsByLabel('Duration'), 'Average') || 0

      this.logger.notice(`${style.aside('Invocations:')} ${invocationsCount}`)
      this.logger.notice(`${style.aside('Throttles:')} ${throttlesCount}`)
      this.logger.notice(`${style.aside('Errors:')} ${errorsCount}`)
      this.logger.notice(
        `${style.aside('Average Duration:')} ${Number(
          durationAverage.toFixed(2),
        )}ms`,
      )
    } else {
      this.logger.notice('No metrics found')
    }
  }
}

export default AwsMetrics
