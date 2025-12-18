import {
  CloudWatchLogsClient as AwsSdkCloudWatchLogsClient,
  FilterLogEventsCommand,
  StartQueryCommand,
  GetQueryResultsCommand,
  DescribeLogGroupsCommand,
} from '@aws-sdk/client-cloudwatch-logs'
import {
  CloudWatchClient as AwsSdkCloudWatchClient,
  GetMetricDataCommand,
  DescribeAlarmsCommand,
  DescribeAlarmHistoryCommand,
  PutMetricAlarmCommand,
} from '@aws-sdk/client-cloudwatch'
import { ServerlessError, log, addProxyToAwsClient } from '@serverless/util'

const logger = log.get('aws:cloudwatch')

/**
 * AWS CloudWatch Client to interact with CloudWatch Logs.
 */
export class AwsCloudWatchClient {
  /**
   * Constructor for the AwsCloudWatchClient.
   *
   * @param {Object} params - Constructor parameters.
   * @param {Object} [params.awsConfig] - AWS SDK configuration options.
   */
  constructor(awsConfig = {}) {
    this.logsClient = addProxyToAwsClient(
      new AwsSdkCloudWatchLogsClient({
        ...awsConfig,
      }),
    )
    this.metricsClient = addProxyToAwsClient(
      new AwsSdkCloudWatchClient({
        ...awsConfig,
      }),
    )
  }

  createMetricsAlarm({
    scalingPolicyArn,
    metric: { metricName, namespace, dimensions },
    period,
    evaluationPeriods,
    threshold,
    comparisonOperator,
    unit,
  }) {
    const alarmName = `${scalingPolicyArn.split(':').pop()}-${metricName}`
    const alarmDescription = `Alarm for ${metricName} metric`

    const command = new PutMetricAlarmCommand({
      AlarmName: alarmName,
      AlarmDescription: alarmDescription,
      ComparisonOperator: comparisonOperator,
      EvaluationPeriods: evaluationPeriods,
      MetricName: metricName,
      Namespace: namespace,
      Period: period,
      Statistic: 'Average',
      Threshold: threshold,
      Unit: unit,
      Dimensions: dimensions.map((d) => ({
        Name: d.name,
        Value: d.value,
      })),
      AlarmActions: [scalingPolicyArn],
    })

    return this.metricsClient.send(command)
  }

  /**
   * Describes CloudWatch alarms with optional filtering
   *
   * @param {Object} params - Parameters for describing alarms
   * @param {string[]} [params.AlarmNames] - Optional array of alarm names to retrieve
   * @param {string} [params.AlarmNamePrefix] - Optional prefix to filter alarms by name
   * @param {string} [params.StateValue] - Optional alarm state to filter by (OK, ALARM, INSUFFICIENT_DATA)
   * @returns {Promise<Object[]>} - Array of alarm objects
   */
  describeAlarms = async (params = {}) => {
    try {
      const command = new DescribeAlarmsCommand(params)
      const response = await this.metricsClient.send(command)
      return response.MetricAlarms || []
    } catch (error) {
      logger.error(`Error describing CloudWatch alarms: ${error.message}`)
      throw new ServerlessError(
        `Failed to describe CloudWatch alarms: ${error.message}`,
        'CLOUDWATCH_DESCRIBE_ALARMS_ERROR',
      )
    }
  }

  /**
   * Describes the history for a CloudWatch alarm
   *
   * @param {Object} params - Parameters for describing alarm history
   * @param {string} params.AlarmName - The name of the alarm
   * @param {Date} [params.StartDate] - Optional start date for history
   * @param {Date} [params.EndDate] - Optional end date for history
   * @param {string} [params.HistoryItemType] - Optional type of history items to retrieve
   * @param {number} [params.MaxRecords] - Optional maximum number of records to retrieve
   * @returns {Promise<Object[]>} - Array of alarm history items
   */
  describeAlarmHistory = async (params = {}) => {
    try {
      const command = new DescribeAlarmHistoryCommand(params)
      const response = await this.metricsClient.send(command)
      return response.AlarmHistoryItems || []
    } catch (error) {
      logger.error(
        `Error describing CloudWatch alarm history: ${error.message}`,
      )
      throw new ServerlessError(
        `Failed to describe CloudWatch alarm history: ${error.message}`,
        'CLOUDWATCH_DESCRIBE_ALARM_HISTORY_ERROR',
      )
    }
  }

  /**
   * Retrieves recent log events from the specified CloudWatch Log Group.
   *
   * This method fetches log events using the FilterLogEventsCommand, with an optional start time and limit.
   * If startTime is not provided, it defaults to retrieving events from the last 5 minutes.
   *
   * @param {Object} params - Parameters for fetching recent logs.
   * @param {string} params.logGroupName - The name of the CloudWatch Logs log group.
   * @param {number} [params.limit=20] - The maximum number of log events to retrieve.
   * @param {number} [params.startTime] - The start time in milliseconds since the epoch to filter events from.
   * @returns {Promise<Object[]>} - An array of log event objects.
   * @throws {ServerlessError} If the log group name is not provided or fetching logs fails.
   */
  /**
   * Describes log groups in CloudWatch Logs
   *
   * @param {Object} params - Parameters for the operation
   * @param {string} [params.logGroupNamePrefix] - The prefix to match
   * @param {number} [params.limit] - The maximum number of log groups to return
   * @returns {Promise<Object>} - The response from the DescribeLogGroups operation
   * @throws {ServerlessError} If fetching log groups fails
   */
  describeLogGroups = async ({ logGroupNamePrefix, limit } = {}) => {
    try {
      const command = new DescribeLogGroupsCommand({
        logGroupNamePrefix,
        limit,
      })

      return await this.logsClient.send(command)
    } catch (error) {
      logger.error(`Error describing log groups: ${error.message}`)
      throw new ServerlessError(
        `Failed to describe log groups: ${error.message}`,
        'CLOUDWATCH_DESCRIBE_LOG_GROUPS_ERROR',
      )
    }
  }

  getRecentLogs = async ({ logGroupName, limit = 20, startTime }) => {
    if (!logGroupName) {
      throw new ServerlessError(
        'Log group name must be provided to fetch logs',
        'CLOUDWATCH_LOG_GROUP_MISSING',
      )
    }

    const now = Date.now()
    const effectiveStartTime = startTime || now - 5 * 60 * 1000 // Default to the last 5 minutes

    try {
      const command = new FilterLogEventsCommand({
        logGroupName,
        startTime: effectiveStartTime,
        limit,
      })
      const response = await this.logsClient.send(command)
      return response.events || []
    } catch (error) {
      logger.error(
        `Failed to retrieve logs for log group ${logGroupName}: ${error.message}`,
      )
      throw new ServerlessError(error.message, 'CLOUDWATCH_GET_LOGS_FAILED')
    }
  }

  /**
   * Formats CloudWatch log events into a human-readable string.
   *
   * This method takes an array of log event objects and returns a string where each log event is arranged with
   * its details separated by line breaks. Each event includes the event ID, a formatted timestamp, the log stream name,
   * and the original message (which may already contain its own line breaks).
   *
   * @param {Object} params - Parameters for formatting logs.
   * @param {Array<Object>} params.logs - Array of log event objects.
   * @returns {string} - The formatted log string.
   */
  prettyPrintLogs = ({ logs }) => {
    if (!logs || !Array.isArray(logs)) {
      return ''
    }

    const formattedLogs = logs.map((event) => {
      const timestamp = event.timestamp
        ? new Date(event.timestamp).toLocaleString()
        : 'N/A'
      const message = event.message || ''

      return `${timestamp}: ${message}`
    })

    return formattedLogs.join('\n')
  }

  /**
   * Fetches CloudWatch metrics for Lambda functions.
   *
   * This method retrieves multiple metrics for the specified Lambda functions using the GetMetricDataCommand.
   * It supports various Lambda metrics like Invocations, Errors, Duration, Throttles, etc.
   *
   * @param {Object} params - Parameters for fetching metrics.
   * @param {string[]} params.functionNames - Array of Lambda function names.
   * @param {Date|number} params.startTime - The start time to fetch metrics from.
   * @param {Date|number} params.endTime - The end time to fetch metrics to.
   * @param {number} [params.period=3600] - The granularity, in seconds, of the returned data points (minimum 60).
   * @returns {Promise<Object>} - An object containing metrics data for each function.
   * @throws {ServerlessError} If fetching metrics fails.
   */
  /**
   * Filters log events from CloudWatch Logs using the FilterLogEvents API.
   * This function is more cost-effective than CloudWatch Logs Insights queries
   * but less scalable for large volumes of logs.
   *
   * @param {Object} params - Parameters for filtering log events
   * @param {string[]} params.logGroupIdentifiers - Array of CloudWatch Log Group names or ARNs to search within
   * @param {string} [params.filterPattern] - Optional pattern to filter logs by (follows CloudWatch filter pattern syntax)
   * @param {number|string} [params.startTime] - Optional start time for logs (ISO string or timestamp in ms)
   * @param {number|string} [params.endTime] - Optional end time for logs (ISO string or timestamp in ms)
   * @param {number} [params.limit=100] - Optional limit for the number of log events to retrieve per log group
   * @returns {Promise<Object>} - Object containing filtered log events and metadata
   */
  filterLogEvents = async ({
    logGroupIdentifiers,
    filterPattern,
    startTime,
    endTime,
    limit = 100,
  }) => {
    if (
      !Array.isArray(logGroupIdentifiers) ||
      logGroupIdentifiers.length === 0
    ) {
      throw new ServerlessError(
        'At least one log group identifier must be provided',
        'CLOUDWATCH_LOG_GROUP_MISSING',
      )
    }

    // Process time parameters
    const now = Date.now()
    let effectiveStartTime
    let effectiveEndTime = endTime ? this.parseTimeInput(endTime) : now

    // Default to last 15 minutes if startTime not provided
    if (!startTime) {
      effectiveStartTime = effectiveEndTime - 15 * 60 * 1000 // 15 minutes
    } else {
      effectiveStartTime = this.parseTimeInput(startTime)
    }

    let allEvents = []
    let errors = []

    // Process all log groups in parallel
    const fetchLogGroupEvents = async (logGroupName) => {
      try {
        // Collect all events with pagination
        let nextToken
        let groupEvents = []

        do {
          const commandParams = {
            logGroupName,
            startTime: effectiveStartTime,
            endTime: effectiveEndTime,
            limit,
            nextToken,
          }

          // Add filter pattern if provided
          if (filterPattern) {
            commandParams.filterPattern = filterPattern
          }

          const command = new FilterLogEventsCommand(commandParams)
          const response = await this.logsClient.send(command)

          if (response.events && response.events.length > 0) {
            groupEvents = groupEvents.concat(response.events)
          }

          nextToken = response.nextToken
        } while (nextToken && groupEvents.length < limit)

        // Limit events to the requested number
        if (groupEvents.length > limit) {
          groupEvents = groupEvents.slice(0, limit)
        }

        return {
          logGroupName,
          events: groupEvents,
          error: null,
        }
      } catch (error) {
        logger.error(
          `Error filtering logs for ${logGroupName}: ${error.message}`,
        )
        return {
          logGroupName,
          events: [],
          error: error.message,
        }
      }
    }

    // Execute all log group queries in parallel
    const logGroupPromises = logGroupIdentifiers.map(fetchLogGroupEvents)
    const results = await Promise.all(logGroupPromises)

    // Process successful results
    allEvents = results
      .filter((result) => !result.error)
      .map((result) => ({
        logGroupName: result.logGroupName,
        events: result.events,
      }))

    // Process errors
    errors = results
      .filter((result) => result.error)
      .map((result) => ({
        logGroupName: result.logGroupName,
        error: result.error,
      }))

    // Sort all events by timestamp
    const flattenedEvents = allEvents
      .flatMap((group) =>
        group.events.map((event) => ({
          ...event,
          logGroupName: group.logGroupName,
        })),
      )
      .sort((a, b) => a.timestamp - b.timestamp)

    return {
      events: flattenedEvents,
      errors,
      timeRange: {
        startTime: effectiveStartTime,
        endTime: effectiveEndTime,
      },
      metadata: {
        logGroupsProcessed: logGroupIdentifiers.length,
        logGroupsWithErrors: errors.length,
        totalEvents: flattenedEvents.length,
      },
    }
  }

  /**
   * Helper function to parse time input (ISO string or timestamp)
   *
   * @param {string|number} timeInput - Time input as ISO string or timestamp in milliseconds
   * @returns {number} - Timestamp in milliseconds
   */
  parseTimeInput = (timeInput) => {
    if (typeof timeInput === 'number') {
      return timeInput
    }

    if (typeof timeInput === 'string') {
      // Try parsing as ISO date string
      const date = new Date(timeInput)
      if (!isNaN(date.getTime())) {
        return date.getTime()
      }

      // Try parsing as numeric string (timestamp)
      const timestamp = parseInt(timeInput, 10)
      if (!isNaN(timestamp)) {
        return timestamp
      }
    }

    throw new ServerlessError(
      `Invalid time format: ${timeInput}. Please provide an ISO date string or timestamp in milliseconds.`,
      'CLOUDWATCH_INVALID_TIME_FORMAT',
    )
  }

  getMetricData = async ({
    functionNames,
    startTime,
    endTime,
    period = 3600,
  }) => {
    if (
      !functionNames ||
      !Array.isArray(functionNames) ||
      functionNames.length === 0
    ) {
      throw new ServerlessError(
        'Function names must be provided to fetch metrics',
        'CLOUDWATCH_FUNCTION_NAMES_MISSING',
      )
    }

    if (!startTime || !endTime) {
      throw new ServerlessError(
        'Start time and end time must be provided to fetch metrics',
        'CLOUDWATCH_TIME_RANGE_MISSING',
      )
    }

    // Convert Date objects to timestamps if necessary
    const effectiveStartTime =
      startTime instanceof Date ? startTime.getTime() : startTime
    const effectiveEndTime =
      endTime instanceof Date ? endTime.getTime() : endTime

    // List of metrics to fetch for each function
    const metricNames = [
      'Invocations',
      'Errors',
      'Throttles',
      'Duration',
      'ConcurrentExecutions',
      'IteratorAge',
      'DeadLetterErrors',
      'ProvisionedConcurrencySpilloverInvocations',
      'ProvisionedConcurrencyUtilization',
      'ProvisionedConcurrencyInvocations',
      'UnreservedConcurrentExecutions',
      'DestinationDeliveryFailures',
    ]

    // Statistics to fetch for each metric
    const metricStatistics = {
      Duration: ['Average', 'Maximum', 'p95', 'p99'],
      ConcurrentExecutions: ['Maximum', 'Average'],
      IteratorAge: ['Maximum', 'p95'],
      ProvisionedConcurrencyUtilization: ['Maximum', 'Average'],
      UnreservedConcurrentExecutions: ['Maximum'],
      // Default statistics for other metrics
      default: ['Sum'],
    }

    try {
      // Prepare metric queries
      const metricDataQueries = []
      let queryId = 0

      functionNames.forEach((functionName) => {
        metricNames.forEach((metricName) => {
          const statistics =
            metricStatistics[metricName] || metricStatistics.default

          statistics.forEach((stat) => {
            const id = `q${queryId++}`
            metricDataQueries.push({
              Id: id,
              MetricStat: {
                Metric: {
                  Namespace: 'AWS/Lambda',
                  MetricName: metricName,
                  Dimensions: [
                    {
                      Name: 'FunctionName',
                      Value: functionName,
                    },
                  ],
                },
                Period: period,
                Stat: stat,
              },
              Label: `${functionName}:${metricName}:${stat}`,
            })
          })
        })
      })

      const command = new GetMetricDataCommand({
        StartTime: new Date(effectiveStartTime),
        EndTime: new Date(effectiveEndTime),
        MetricDataQueries: metricDataQueries,
        ScanBy: 'TimestampDescending',
      })

      const response = await this.metricsClient.send(command)

      // Process and organize the results by function name
      const result = {}

      functionNames.forEach((functionName) => {
        result[functionName] = {}
      })

      if (response.MetricDataResults) {
        response.MetricDataResults.forEach((metricData) => {
          const [functionName, metricName, stat] = metricData.Label.split(':')

          if (!result[functionName][metricName]) {
            result[functionName][metricName] = {}
          }

          // For metrics with a single statistic, store the values directly
          if (metricStatistics[metricName]) {
            if (!result[functionName][metricName][stat]) {
              result[functionName][metricName][stat] = {}
            }

            result[functionName][metricName][stat] = {
              values: metricData.Values || [],
              timestamps:
                metricData.Timestamps?.map((ts) => ts.toISOString()) || [],
            }
          } else {
            // For metrics with default statistics
            result[functionName][metricName] = {
              values: metricData.Values || [],
              timestamps:
                metricData.Timestamps?.map((ts) => ts.toISOString()) || [],
            }
          }
        })
      }

      return result
    } catch (error) {
      logger.error(
        `Failed to retrieve metrics for Lambda functions: ${error.message}`,
      )
      throw new ServerlessError(error.message, 'CLOUDWATCH_GET_METRICS_FAILED')
    }
  }

  /**
   * Fetches CloudWatch metrics for SQS queues.
   *
   * This method retrieves multiple metrics for the specified SQS queues using the GetMetricDataCommand.
   * It supports various SQS metrics like NumberOfMessagesSent, NumberOfMessagesReceived, ApproximateAgeOfOldestMessage, etc.
   *
   * @param {Object} params - Parameters for fetching metrics.
   * @param {string[]} params.queueNames - Array of SQS queue names.
   * @param {Date|number} params.startTime - The start time to fetch metrics from.
   * @param {Date|number} params.endTime - The end time to fetch metrics to.
   * @param {number} [params.period=3600] - The granularity, in seconds, of the returned data points (minimum 60).
   * @returns {Promise<Object>} - An object containing metrics data for each queue.
   * @throws {ServerlessError} If fetching metrics fails.
   */
  getSqsMetricData = async ({
    queueNames,
    startTime,
    endTime,
    period = 3600,
  }) => {
    if (!queueNames || !Array.isArray(queueNames) || queueNames.length === 0) {
      throw new ServerlessError(
        'Queue names must be provided to fetch metrics',
        'CLOUDWATCH_QUEUE_NAMES_MISSING',
      )
    }

    if (!startTime || !endTime) {
      throw new ServerlessError(
        'Start time and end time must be provided to fetch metrics',
        'CLOUDWATCH_TIME_RANGE_MISSING',
      )
    }

    // Convert Date objects to timestamps if necessary
    const effectiveStartTime =
      startTime instanceof Date ? startTime.getTime() : startTime
    const effectiveEndTime =
      endTime instanceof Date ? endTime.getTime() : endTime

    // List of metrics to fetch for each queue
    const metricNames = [
      'MessageRetentionPeriod',
      'AllErrors',
      'ApproximateNumberOfMessagesDelayed',
      'NumberOfMessagesSent',
      'NumberOfMessagesReceived',
      'NumberOfMessagesDeleted',
      'SentMessageSize',
      'NumberOfEmptyReceives',
      'ApproximateAgeOfOldestMessage',
      'ApproximateNumberOfMessagesVisible',
      'ApproximateNumberOfMessagesNotVisible',
      'MessagesDeletedFromDeadLetterQueue',
      'NumberOfMessagesSentToDeadLetterQueue',
      'ReceiveMessageWaitTimeSeconds',
    ]

    // Statistics to fetch for each metric
    const metricStatistics = {
      MessageRetentionPeriod: ['Maximum', 'Minimum'],
      AllErrors: ['Sum', 'Average'],
      ApproximateNumberOfMessagesDelayed: ['Maximum', 'Average'],
      NumberOfMessagesSent: ['Sum', 'Average'],
      NumberOfMessagesReceived: ['Sum', 'Average'],
      NumberOfMessagesDeleted: ['Sum'],
      SentMessageSize: ['Average', 'p95', 'p99', 'Maximum'],
      NumberOfEmptyReceives: ['Sum', 'Average'],
      ApproximateAgeOfOldestMessage: ['Maximum', 'p95'],
      ApproximateNumberOfMessagesVisible: ['Maximum', 'Average'],
      ApproximateNumberOfMessagesNotVisible: ['Maximum', 'Average'],
      MessagesDeletedFromDeadLetterQueue: ['Sum'],
      NumberOfMessagesSentToDeadLetterQueue: ['Sum'],
      ReceiveMessageWaitTimeSeconds: ['Maximum', 'Minimum'],
      // Default statistics for other metrics
      default: ['Sum'],
    }

    try {
      // Prepare metric queries
      const metricDataQueries = []
      let queryId = 0

      queueNames.forEach((queueName) => {
        metricNames.forEach((metricName) => {
          const statistics =
            metricStatistics[metricName] || metricStatistics.default

          statistics.forEach((stat) => {
            const id = `q${queryId++}`
            metricDataQueries.push({
              Id: id,
              MetricStat: {
                Metric: {
                  Namespace: 'AWS/SQS',
                  MetricName: metricName,
                  Dimensions: [
                    {
                      Name: 'QueueName',
                      Value: queueName,
                    },
                  ],
                },
                Period: period,
                Stat: stat,
              },
              Label: `${queueName}:${metricName}:${stat}`,
            })
          })
        })
      })

      const command = new GetMetricDataCommand({
        StartTime: new Date(effectiveStartTime),
        EndTime: new Date(effectiveEndTime),
        MetricDataQueries: metricDataQueries,
        ScanBy: 'TimestampDescending',
      })

      const response = await this.metricsClient.send(command)

      // Process and organize the results by queue name
      const result = {}

      queueNames.forEach((queueName) => {
        result[queueName] = {}
      })

      if (response.MetricDataResults) {
        response.MetricDataResults.forEach((metricData) => {
          const [queueName, metricName, stat] = metricData.Label.split(':')

          if (!result[queueName][metricName]) {
            result[queueName][metricName] = {}
          }

          // For metrics with multiple statistics, store the values by statistic
          if (
            metricStatistics[metricName] &&
            metricStatistics[metricName].length > 1
          ) {
            if (!result[queueName][metricName][stat]) {
              result[queueName][metricName][stat] = {}
            }

            result[queueName][metricName][stat] = {
              values: metricData.Values || [],
              timestamps:
                metricData.Timestamps?.map((ts) => ts.toISOString()) || [],
            }
          } else {
            // For metrics with a single statistic, store the values directly
            result[queueName][metricName] = {
              values: metricData.Values || [],
              timestamps:
                metricData.Timestamps?.map((ts) => ts.toISOString()) || [],
            }
          }
        })
      }

      return result
    } catch (error) {
      logger.error(
        `Failed to retrieve metrics for SQS queues: ${error.message}`,
      )
      throw new ServerlessError(
        error.message,
        'CLOUDWATCH_GET_SQS_METRICS_FAILED',
      )
    }
  }

  /**
   * Fetches and groups error logs for Lambda functions using CloudWatch Logs Insights.
   *
   * This method uses CloudWatch Logs Insights to query error logs for the specified Lambda functions,
   * and groups similar errors together to provide a summary of the most common error patterns.
   *
   * @param {Object} params - Parameters for fetching error logs.
   * @param {string[]} params.functionNames - Array of Lambda function names.
   * @param {Date|number} params.startTime - The start time to fetch logs from.
   * @param {Date|number} params.endTime - The end time to fetch logs to.
   * @param {number} [params.limit=100] - The maximum number of log groups to return (per function).
   * @returns {Promise<Object>} - An object containing grouped error logs for each function.
   * @throws {ServerlessError} If fetching logs fails.
   */
  /**
   * Executes a CloudWatch Logs Insights query across multiple log groups.
   *
   * This method allows querying multiple log groups in a single CloudWatch Logs Insights query,
   * which is more efficient than running separate queries for each log group.
   *
   * @param {Object} params - Parameters for executing the query.
   * @param {string[]} params.logGroupIdentifiers - Array of CloudWatch Log Group names or ARNs.
   * @param {string} params.queryString - The CloudWatch Logs Insights query string.
   * @param {Date|number} params.startTime - The start time to fetch logs from.
   * @param {Date|number} params.endTime - The end time to fetch logs to.
   * @param {number} [params.limit=100] - The maximum number of log events to return.
   * @returns {Promise<Object>} - An object containing the query results, with events sorted by timestamp.
   * @throws {ServerlessError} If the query execution fails.
   */
  executeLogsInsightsQuery = async ({
    logGroupIdentifiers,
    queryString,
    startTime,
    endTime,
    limit = 100,
  }) => {
    if (
      !logGroupIdentifiers ||
      !Array.isArray(logGroupIdentifiers) ||
      logGroupIdentifiers.length === 0
    ) {
      throw new ServerlessError(
        'Log group identifiers must be provided to execute a query',
        'CLOUDWATCH_LOG_GROUPS_MISSING',
      )
    }

    if (!queryString) {
      throw new ServerlessError(
        'Query string must be provided to execute a query',
        'CLOUDWATCH_QUERY_STRING_MISSING',
      )
    }

    if (!startTime || !endTime) {
      throw new ServerlessError(
        'Start time and end time must be provided to execute a query',
        'CLOUDWATCH_TIME_RANGE_MISSING',
      )
    }

    // Convert Date objects to timestamps if necessary
    const effectiveStartTime =
      startTime instanceof Date ? startTime.getTime() : startTime
    const effectiveEndTime =
      endTime instanceof Date ? endTime.getTime() : endTime

    // Convert timestamps to seconds for CloudWatch Logs Insights
    const startTimeSeconds = Math.floor(effectiveStartTime / 1000)
    const endTimeSeconds = Math.floor(effectiveEndTime / 1000)

    // Execute the query
    const result = await this.executeLogsInsightsQueryInternal({
      logGroupIdentifiers,
      queryString,
      startTimeSeconds,
      endTimeSeconds,
      limit,
    })

    // Process the query results
    const events = []
    const errors = result.errors || []

    if (result.queryResults && result.queryResults.length > 0) {
      // Process and transform the results
      result.queryResults.forEach((resultRow) => {
        // Convert CloudWatch Logs Insights results to a more usable format
        const resultMap = {}
        resultRow.forEach((field) => {
          resultMap[field.field] = field.value
        })

        // Parse timestamp to ISO string for consistency
        const timestamp = resultMap['@timestamp']
          ? new Date(resultMap['@timestamp']).toISOString()
          : null

        events.push({
          timestamp,
          logGroupName: resultMap['@log'] || 'unknown',
          logStream: resultMap['@logStream'] || null,
          message: resultMap['@message'] || null,
          // Include raw result for debugging
          raw: resultMap,
        })
      })
    }

    // Sort all events by timestamp
    events.sort((a, b) => {
      if (!a.timestamp) return 1
      if (!b.timestamp) return -1
      return new Date(a.timestamp) - new Date(b.timestamp)
    })

    return {
      events,
      errors: errors.length > 0 ? errors : undefined,
      timeRange: {
        start: new Date(effectiveStartTime).toISOString(),
        end: new Date(effectiveEndTime).toISOString(),
      },
      statistics: result.statistics,
      raw: result.raw,
    }
  }

  /**
   * Execute a CloudWatch Logs Insights query specifically for pattern analytics
   * This uses the pattern command to automatically group similar log messages
   *
   * @param {Object} params - Parameters for the query
   * @param {string[]} params.logGroupIdentifiers - Array of CloudWatch Log Group names/ARNs
   * @param {string|number} params.startTime - Start time for logs (ISO string or timestamp)
   * @param {string|number} params.endTime - End time for logs (ISO string or timestamp)
   * @param {number} [params.limit=50] - Maximum number of results to return
   * @returns {Promise<Object>} - Query results
   */
  executePatternAnalyticsQuery = async ({
    logGroupIdentifiers,
    startTime,
    endTime,
    limit = 50,
  }) => {
    if (
      !logGroupIdentifiers ||
      !Array.isArray(logGroupIdentifiers) ||
      logGroupIdentifiers.length === 0
    ) {
      throw new ServerlessError(
        'Log group identifiers must be provided to execute a query',
        'CLOUDWATCH_LOG_GROUPS_MISSING',
      )
    }

    if (!startTime || !endTime) {
      throw new ServerlessError(
        'Start time and end time must be provided to execute a query',
        'CLOUDWATCH_TIME_RANGE_MISSING',
      )
    }

    // Convert Date objects to timestamps if necessary
    const effectiveStartTime =
      startTime instanceof Date ? startTime.getTime() : startTime
    const effectiveEndTime =
      endTime instanceof Date ? endTime.getTime() : endTime

    // Convert timestamps to seconds for CloudWatch Logs Insights
    const startTimeSeconds = Math.floor(effectiveStartTime / 1000)
    const endTimeSeconds = Math.floor(effectiveEndTime / 1000)

    // Hardcoded pattern analytics query
    const patternQueryString = `
      fields @timestamp, @message
      | filter @message like /(?i)(error|exception|fail|timeout|cannot|crash|fatal|invalid|denied|unauthorized|forbidden|rejected|unhandled|undefined|null|panic|abort|critical|severe|warn|issue)/
      | pattern @message
      | sort @patternCount desc
      | limit ${limit}
    `

    // Execute the query with the hardcoded pattern query
    const result = await this.executeLogsInsightsQueryInternal({
      logGroupIdentifiers,
      queryString: patternQueryString,
      startTimeSeconds,
      endTimeSeconds,
      limit,
    })

    // Process the pattern query results
    const events = []
    const errors = result.errors || []

    if (result.queryResults && result.queryResults.length > 0) {
      // Process and transform the pattern results
      result.queryResults.forEach((resultRow) => {
        // Convert CloudWatch Logs Insights results to a more usable format
        const resultMap = {}
        resultRow.forEach((field) => {
          resultMap[field.field] = field.value
        })

        // Extract pattern information
        const pattern = resultMap['@pattern'] || ''
        const sampleCount = resultMap['@sampleCount']
          ? parseInt(resultMap['@sampleCount'], 10)
          : 0
        let examples = []

        // Parse log samples if available
        if (resultMap['@logSamples']) {
          try {
            const logSamples = JSON.parse(resultMap['@logSamples'])
            examples = logSamples.map((sample) => sample.logEvent || '')
          } catch (e) {
            // If parsing fails, use the raw value
            examples = [resultMap['@logSamples']]
          }
        }

        // Parse related patterns if available
        let relatedPatterns = []
        if (resultMap['@relatedPattern']) {
          try {
            relatedPatterns = JSON.parse(resultMap['@relatedPattern'])
          } catch (e) {
            // If parsing fails, use empty array
            relatedPatterns = []
          }
        }

        // Extract ratio as a number if possible
        let ratio = null
        if (resultMap['@ratio']) {
          ratio = parseFloat(resultMap['@ratio']) || resultMap['@ratio']
        }

        events.push({
          pattern,
          count: sampleCount,
          examples,
          patternId: resultMap['@PatternId'] || null,
          regexString: resultMap['@regexString'] || null,
          ratio,
          relatedPatterns,
          severityLabel: resultMap['@severityLabel'] || null,
          raw: resultMap,
        })
      })
    }

    return {
      events,
      errors: errors.length > 0 ? errors : undefined,
      timeRange: {
        start: new Date(effectiveStartTime).toISOString(),
        end: new Date(effectiveEndTime).toISOString(),
      },
      statistics: result.statistics,
      raw: result.raw,
    }
  }

  /**
   * Internal method to execute CloudWatch Logs Insights queries
   * @private
   */
  executeLogsInsightsQueryInternal = async ({
    logGroupIdentifiers,
    queryString,
    startTimeSeconds,
    endTimeSeconds,
    limit,
  }) => {
    if (!startTimeSeconds || !endTimeSeconds) {
      throw new ServerlessError(
        'Start time and end time in seconds must be provided to execute a query',
        'CLOUDWATCH_TIME_RANGE_MISSING',
      )
    }
    try {
      // Start the query across multiple log groups
      const startQueryCommand = new StartQueryCommand({
        logGroupIdentifiers,
        startTime: startTimeSeconds,
        endTime: endTimeSeconds,
        queryString,
        limit,
      })

      const startQueryResponse = await this.logsClient.send(startQueryCommand)
      const queryId = startQueryResponse.queryId

      // Wait for query to complete and get results
      let queryStatus = 'Running'
      let queryResults = null
      let queryStatistics = null

      // Poll for results with exponential backoff
      let retryCount = 0
      const maxRetries = 10
      const baseDelay = 500 // ms

      while (queryStatus === 'Running' && retryCount < maxRetries) {
        // Exponential backoff with jitter
        const delay = Math.min(
          baseDelay * Math.pow(2, retryCount) + Math.random() * 100,
          10000,
        )
        await new Promise((resolve) => setTimeout(resolve, delay))

        const getResultsCommand = new GetQueryResultsCommand({
          queryId,
        })

        const getResultsResponse = await this.logsClient.send(getResultsCommand)
        queryStatus = getResultsResponse.status
        queryResults = getResultsResponse.results
        // Store statistics if available
        if (getResultsResponse.statistics) {
          queryStatistics = getResultsResponse.statistics
        }

        retryCount++
      }

      // Return raw query results for processing in the main function
      const errors = []
      if (queryStatus === 'Running') {
        errors.push('Query timed out')
      } else if (queryStatus !== 'Complete') {
        errors.push(`Query failed with status: ${queryStatus}`)
      }

      return {
        queryResults,
        queryStatus,
        statistics: queryStatistics,
        errors: errors.length > 0 ? errors : undefined,
        raw: {
          results: queryResults,
          status: queryStatus,
          statistics: queryStatistics,
        },
      }
    } catch (error) {
      throw new ServerlessError(
        `Failed to execute CloudWatch Logs Insights query: ${error.message}`,
        'CLOUDWATCH_LOGS_INSIGHTS_QUERY_FAILED',
      )
    }
  }

  getErrorLogs = async ({ functionNames, startTime, endTime, limit = 100 }) => {
    if (
      !functionNames ||
      !Array.isArray(functionNames) ||
      functionNames.length === 0
    ) {
      throw new ServerlessError(
        'Function names must be provided to fetch error logs',
        'CLOUDWATCH_FUNCTION_NAMES_MISSING',
      )
    }

    if (!startTime || !endTime) {
      throw new ServerlessError(
        'Start time and end time must be provided to fetch error logs',
        'CLOUDWATCH_TIME_RANGE_MISSING',
      )
    }

    // Convert Date objects to timestamps if necessary
    const effectiveStartTime =
      startTime instanceof Date ? startTime.getTime() : startTime
    const effectiveEndTime =
      endTime instanceof Date ? endTime.getTime() : endTime

    try {
      const result = {}

      // Process each function in parallel
      await Promise.all(
        functionNames.map(async (functionName) => {
          const logGroupName = `/aws/lambda/${functionName}`

          try {
            // CloudWatch Logs Insights query to group error logs
            // This query filters for error logs and groups them by error message pattern
            const queryString = `
              fields @timestamp, @message
              | filter @message like /(?i)(error|exception|fail|timeout)/
              | parse @message /.*\"errorMessage\":\s*\"(?<errorMessage>.*?)\".*/
              | parse @message /.*Exception:\s*(?<exceptionMessage>.*?)(?:\\n|$)/
              | parse @message /.*Error:\s*(?<errorText>.*?)(?:\\n|$)/
              | fields @timestamp,
                  coalesce(errorMessage, exceptionMessage, errorText, @message) as errorContent
              | sort @timestamp desc
              | limit ${limit}
            `

            // Use the shared executeLogsInsightsQuery method
            const queryResult = await this.executeLogsInsightsQuery({
              logGroupIdentifiers: [logGroupName],
              queryString,
              startTime: effectiveStartTime,
              endTime: effectiveEndTime,
              limit,
            })

            if (!queryResult.events || queryResult.events.length === 0) {
              result[functionName] = {
                error:
                  queryResult.errors?.length > 0
                    ? queryResult.errors[0]
                    : 'Query returned no results',
              }
              return
            }

            // Process and group the results
            const errorGroups = {}
            const errorTimestamps = {}

            queryResult.events.forEach((event) => {
              const errorContent = event.raw?.errorContent
              const timestamp = event.timestamp

              if (errorContent) {
                // Create a simplified key for grouping similar errors
                // Remove specific details like timestamps, request IDs, and UUIDs
                let groupKey = errorContent
                  .replace(
                    /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d+Z/g,
                    'TIMESTAMP',
                  ) // ISO timestamps
                  .replace(
                    /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi,
                    'UUID',
                  ) // UUIDs
                  .replace(/[0-9a-f]{24}/gi, 'OBJECTID') // MongoDB ObjectIDs
                  .replace(/\b[A-Z0-9]{20}\b/g, 'REQUEST_ID') // AWS Request IDs
                  .replace(/\d+\.\d+\.\d+\.\d+/g, 'IP_ADDRESS') // IP addresses
                  .replace(/\d{10,}/g, 'LONG_NUMBER') // Long numbers (likely timestamps)

                // Truncate very long error messages to avoid excessive grouping
                if (groupKey.length > 200) {
                  groupKey = groupKey.substring(0, 200)
                }

                if (!errorGroups[groupKey]) {
                  errorGroups[groupKey] = {
                    count: 0,
                    sample: errorContent,
                    timestamps: [],
                  }
                }

                errorGroups[groupKey].count++

                // Store the most recent timestamps (up to 5) for each error group
                if (timestamp && errorGroups[groupKey].timestamps.length < 5) {
                  errorGroups[groupKey].timestamps.push(timestamp)
                }
              }
            })

            // Convert to array and sort by count (most frequent first)
            const sortedErrorGroups = Object.entries(errorGroups)
              .map(([key, value]) => ({
                pattern: key,
                count: value.count,
                sample: value.sample,
                timestamps: value.timestamps.sort().reverse(), // Most recent first
              }))
              .sort((a, b) => b.count - a.count)

            result[functionName] = {
              totalErrors: sortedErrorGroups.reduce(
                (sum, group) => sum + group.count,
                0,
              ),
              errorGroups: sortedErrorGroups,
              timeRange: queryResult.timeRange,
            }
          } catch (error) {
            logger.error(
              `Failed to retrieve error logs for function ${functionName}: ${error.message}`,
            )
            result[functionName] = { error: error.message }
          }
        }),
      )

      return result
    } catch (error) {
      logger.error(
        `Failed to retrieve error logs for Lambda functions: ${error.message}`,
      )
      throw new ServerlessError(
        error.message,
        'CLOUDWATCH_GET_ERROR_LOGS_FAILED',
      )
    }
  }

  /**
   * Fetches CloudWatch metrics for S3 buckets.
   *
   * This method retrieves multiple metrics for the specified S3 buckets using the GetMetricDataCommand.
   * It supports various S3 metrics like BucketSizeBytes, NumberOfObjects, AllRequests, etc.
   *
   * @param {Object} params - Parameters for fetching metrics.
   * @param {string[]} params.bucketNames - Array of S3 bucket names.
   * @param {Date|number} params.startTime - The start time to fetch metrics from.
   * @param {Date|number} params.endTime - The end time to fetch metrics to.
   * @param {number} [params.period=3600] - The granularity, in seconds, of the returned data points (minimum 60).
   * @returns {Promise<Object>} - An object containing metrics data for each bucket.
   * @throws {ServerlessError} If fetching metrics fails.
   */
  getS3MetricData = async ({
    bucketNames,
    startTime,
    endTime,
    period = 3600,
  }) => {
    if (
      !bucketNames ||
      !Array.isArray(bucketNames) ||
      bucketNames.length === 0
    ) {
      throw new ServerlessError(
        'Bucket names must be provided to fetch metrics',
        'CLOUDWATCH_BUCKET_NAMES_MISSING',
      )
    }

    if (!startTime || !endTime) {
      throw new ServerlessError(
        'Start time and end time must be provided to fetch metrics',
        'CLOUDWATCH_TIME_RANGE_MISSING',
      )
    }

    // Convert Date objects to timestamps if necessary
    const effectiveStartTime =
      startTime instanceof Date ? startTime.getTime() : startTime
    const effectiveEndTime =
      endTime instanceof Date ? endTime.getTime() : endTime

    // List of metrics to fetch for each bucket
    const metricNames = [
      'BucketSizeBytes',
      'NumberOfObjects',
      'AllRequests',
      'GetRequests',
      'PutRequests',
      'DeleteRequests',
      'FirstByteLatency',
      'TotalRequestLatency',
      '4xxErrors',
      '5xxErrors',
      'BytesDownloaded',
      'BytesUploaded',
    ]

    // Statistics to fetch for each metric
    const metricStatistics = {
      BucketSizeBytes: ['Average', 'Maximum'],
      NumberOfObjects: ['Average', 'Maximum'],
      AllRequests: ['Sum', 'Average'],
      GetRequests: ['Sum', 'Average'],
      PutRequests: ['Sum', 'Average'],
      DeleteRequests: ['Sum', 'Average'],
      FirstByteLatency: ['Average', 'p95', 'p99', 'Maximum'],
      TotalRequestLatency: ['Average', 'p95', 'p99', 'Maximum'],
      '4xxErrors': ['Sum', 'Average'],
      '5xxErrors': ['Sum', 'Average'],
      BytesDownloaded: ['Sum'],
      BytesUploaded: ['Sum'],
    }

    try {
      const metricDataQueries = []
      let queryIndex = 0

      // Create metric data queries for each bucket and metric
      bucketNames.forEach((bucketName) => {
        metricNames.forEach((metricName) => {
          const statistics = metricStatistics[metricName] || ['Average']

          statistics.forEach((statistic) => {
            metricDataQueries.push({
              Id: `m${queryIndex++}`,
              MetricStat: {
                Metric: {
                  Namespace: 'AWS/S3',
                  MetricName: metricName,
                  Dimensions: [
                    {
                      Name: 'BucketName',
                      Value: bucketName,
                    },
                  ],
                },
                Period: period,
                Stat: statistic,
              },
              ReturnData: true,
            })
          })
        })
      })

      // Fetch metrics data
      const command = new GetMetricDataCommand({
        MetricDataQueries: metricDataQueries,
        StartTime: new Date(effectiveStartTime),
        EndTime: new Date(effectiveEndTime),
      })

      const response = await this.metricsClient.send(command)

      // Process and organize the metrics data by bucket
      const metricsByBucket = {}

      bucketNames.forEach((bucketName) => {
        metricsByBucket[bucketName] = {}
      })

      // Map the results back to buckets and metrics
      let currentQueryIndex = 0
      bucketNames.forEach((bucketName) => {
        metricNames.forEach((metricName) => {
          const statistics = metricStatistics[metricName] || ['Average']
          metricsByBucket[bucketName][metricName] = {}

          statistics.forEach((statistic) => {
            const metricResult = response.MetricDataResults[currentQueryIndex++]
            if (metricResult) {
              metricsByBucket[bucketName][metricName][statistic] = {
                values: metricResult.Values || [],
                timestamps:
                  metricResult.Timestamps?.map((ts) => ts.toISOString()) || [],
              }
            }
          })
        })
      })

      return metricsByBucket
    } catch (error) {
      logger.error(
        `Failed to retrieve metrics for S3 buckets: ${error.message}`,
      )
      throw new ServerlessError(error.message, 'CLOUDWATCH_GET_METRICS_FAILED')
    }
  }

  /**
   * Fetches CloudWatch metrics for DynamoDB tables.
   *
   * This method retrieves multiple metrics for the specified DynamoDB tables using the GetMetricDataCommand.
   * It supports various DynamoDB metrics like read/write capacity, throttling events, latency, etc.
   *
   * @param {Object} params - Parameters for fetching metrics.
   * @param {string[]} params.tableNames - Array of DynamoDB table names.
   * @param {Date|number} params.startTime - The start time to fetch metrics from.
   * @param {Date|number} params.endTime - The end time to fetch metrics to.
   * @param {number} [params.period=3600] - The granularity, in seconds, of the returned data points (minimum 60).
   * @returns {Promise<Object>} - An object containing metrics data for each table.
   * @throws {ServerlessError} If fetching metrics fails.
   */
  getDynamoDBMetricData = async ({
    tableNames,
    startTime,
    endTime,
    period = 3600,
  }) => {
    if (!tableNames || !Array.isArray(tableNames) || tableNames.length === 0) {
      throw new ServerlessError(
        'Table names must be provided to fetch metrics',
        'CLOUDWATCH_TABLE_NAMES_MISSING',
      )
    }

    if (!startTime || !endTime) {
      throw new ServerlessError(
        'Start time and end time must be provided to fetch metrics',
        'CLOUDWATCH_TIME_RANGE_MISSING',
      )
    }

    // Convert Date objects to timestamps if necessary
    const effectiveStartTime =
      startTime instanceof Date ? startTime.getTime() : startTime
    const effectiveEndTime =
      endTime instanceof Date ? endTime.getTime() : endTime

    // List of metrics to fetch for each table
    const metricNames = [
      // Read and Write Capacity Metrics
      'ConsumedReadCapacityUnits',
      'ConsumedWriteCapacityUnits',
      'ProvisionedReadCapacityUnits',
      'ProvisionedWriteCapacityUnits',
      'MaxProvisionedReadCapacityUtilization',
      'MaxProvisionedWriteCapacityUtilization',

      // Throttling Metrics
      'ReadThrottleEvents',
      'WriteThrottleEvents',
      'ThrottledRequests',

      // Successful Requests Metrics
      'SuccessfulRequestCount',
      'GetItem.SuccessfulRequestLatency',
      'Scan.SuccessfulRequestLatency',
      'Query.SuccessfulRequestLatency',
      'PutItem.SuccessfulRequestLatency',
      'UpdateItem.SuccessfulRequestLatency',
      'DeleteItem.SuccessfulRequestLatency',

      // Latency Metrics
      'GetItem.Latency',
      'PutItem.Latency',
      'Scan.Latency',
      'Query.Latency',

      // Stream Metrics
      'GetRecords.Latency',
      'GetRecords.ReturnedRecordsCount',
      'GetRecords.ReturnedBytes',

      // Time-To-Live Metrics
      'TimeToLiveDeletedItemCount',

      // Errors and System Failures
      'SystemErrors',
      'UserErrors',
      'ConditionalCheckFailedRequests',
      'TransactionConflict',

      // Scan and Query Metrics
      'ReturnedItemCount',
      'ReturnedBytes',

      // Transaction Metrics
      'TransactionConflictErrors',
    ]

    // Statistics to fetch for each metric
    const metricStatistics = {
      // Read and Write Capacity Metrics
      ConsumedReadCapacityUnits: ['Average', 'Maximum', 'Sum'],
      ConsumedWriteCapacityUnits: ['Average', 'Maximum', 'Sum'],
      ProvisionedReadCapacityUnits: ['Maximum'],
      ProvisionedWriteCapacityUnits: ['Maximum'],
      MaxProvisionedReadCapacityUtilization: ['Average', 'Maximum'],
      MaxProvisionedWriteCapacityUtilization: ['Average', 'Maximum'],

      // Throttling Metrics
      ReadThrottleEvents: ['Sum', 'Maximum'],
      WriteThrottleEvents: ['Sum', 'Maximum'],
      ThrottledRequests: ['Sum', 'Maximum'],

      // Successful Requests Metrics
      SuccessfulRequestCount: ['Sum'],
      'GetItem.SuccessfulRequestLatency': ['Average', 'Maximum'],
      'Scan.SuccessfulRequestLatency': ['Average', 'Maximum'],
      'Query.SuccessfulRequestLatency': ['Average', 'Maximum'],
      'PutItem.SuccessfulRequestLatency': ['Average', 'Maximum'],
      'UpdateItem.SuccessfulRequestLatency': ['Average', 'Maximum'],
      'DeleteItem.SuccessfulRequestLatency': ['Average', 'Maximum'],

      // Latency Metrics
      'GetItem.Latency': ['Average', 'Maximum'],
      'PutItem.Latency': ['Average', 'Maximum'],
      'Scan.Latency': ['Average', 'Maximum'],
      'Query.Latency': ['Average', 'Maximum'],

      // Stream Metrics
      'GetRecords.Latency': ['Average', 'Maximum'],
      'GetRecords.ReturnedRecordsCount': ['Sum', 'Maximum'],
      'GetRecords.ReturnedBytes': ['Sum', 'Maximum'],

      // Time-To-Live Metrics
      TimeToLiveDeletedItemCount: ['Sum', 'Maximum'],

      // Errors and System Failures
      SystemErrors: ['Sum', 'Maximum'],
      UserErrors: ['Sum', 'Maximum'],
      ConditionalCheckFailedRequests: ['Sum', 'Maximum'],
      TransactionConflict: ['Sum', 'Maximum'],

      // Scan and Query Metrics
      ReturnedItemCount: ['Average', 'Maximum'],
      ReturnedBytes: ['Sum', 'Maximum'],

      // Transaction Metrics
      TransactionConflictErrors: ['Sum', 'Maximum'],
    }

    try {
      const metricDataQueries = []
      let queryIndex = 0

      // Create metric data queries for each table and metric
      tableNames.forEach((tableName) => {
        metricNames.forEach((metricName) => {
          const statistics = metricStatistics[metricName] || ['Average']

          statistics.forEach((statistic) => {
            metricDataQueries.push({
              Id: `m${queryIndex++}`,
              MetricStat: {
                Metric: {
                  Namespace: 'AWS/DynamoDB',
                  MetricName: metricName,
                  Dimensions: [
                    {
                      Name: 'TableName',
                      Value: tableName,
                    },
                  ],
                },
                Period: period,
                Stat: statistic,
              },
              ReturnData: true,
            })
          })
        })
      })

      // Fetch metrics data
      const command = new GetMetricDataCommand({
        MetricDataQueries: metricDataQueries,
        StartTime: new Date(effectiveStartTime),
        EndTime: new Date(effectiveEndTime),
      })

      const response = await this.metricsClient.send(command)

      // Process and organize the metrics data by table
      const metricsByTable = {}

      tableNames.forEach((tableName) => {
        metricsByTable[tableName] = {}
      })

      // Map the results back to tables and metrics
      let currentQueryIndex = 0
      tableNames.forEach((tableName) => {
        metricNames.forEach((metricName) => {
          const statistics = metricStatistics[metricName] || ['Average']
          metricsByTable[tableName][metricName] = {}

          statistics.forEach((statistic) => {
            const metricResult = response.MetricDataResults[currentQueryIndex++]
            if (metricResult) {
              metricsByTable[tableName][metricName][statistic] = {
                values: metricResult.Values || [],
                timestamps:
                  metricResult.Timestamps?.map((ts) => ts.toISOString()) || [],
              }
            }
          })
        })
      })

      return metricsByTable
    } catch (error) {
      logger.error(
        `Failed to retrieve metrics for DynamoDB tables: ${error.message}`,
      )
      throw new ServerlessError(
        error.message,
        'CLOUDWATCH_GET_DYNAMODB_METRICS_FAILED',
      )
    }
  }
}
