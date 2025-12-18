import { AwsCloudWatchClient } from '../../../../engine/src/lib/aws/cloudwatch.js'
import { parseTimestamp } from './cloudwatch-logs-insights.js'
import { handleAwsCredentialsError } from '../aws-credentials-error-handler.js'

/**
 * Get CloudWatch alarms and their history
 *
 * @param {Object} params - Parameters for the function
 * @param {string[]} [params.alarmNames] - Optional array of alarm names to retrieve
 * @param {string} [params.alarmNamePrefix] - Optional prefix to filter alarms by name
 * @param {string} [params.alarmState] - Optional alarm state to filter by (OK, ALARM, INSUFFICIENT_DATA)
 * @param {string} [params.startDate] - Optional start date for alarm history (ISO string or timestamp)
 * @param {string} [params.endDate] - Optional end date for alarm history (ISO string or timestamp)
 * @param {string} [params.region] - Optional AWS region
 * @param {string} [params.profile] - Optional AWS profile name
 * @returns {Promise<Object>} - CloudWatch alarms and their history
 */
export async function getCloudWatchAlarms(params) {
  const {
    alarmNames,
    alarmNamePrefix,
    alarmState,
    startDate,
    endDate,
    region,
    profile,
  } = params

  // Create AWS config object
  const awsConfig = {}
  if (region) {
    awsConfig.region = region
  }
  if (profile) {
    awsConfig.profile = profile
  }

  // Create CloudWatch client
  const cloudwatchClient = new AwsCloudWatchClient(awsConfig)

  try {
    // Get alarms
    const alarms = await describeAlarms(cloudwatchClient, {
      alarmNames,
      alarmNamePrefix,
      alarmState,
    })

    // Parse date ranges for history
    const now = new Date()
    const defaultStartDate = new Date(now.getTime() - 24 * 60 * 60 * 1000) // 24 hours ago

    const startTimeMs = startDate
      ? parseTimestamp(startDate)
      : defaultStartDate.getTime()
    const endTimeMs = endDate ? parseTimestamp(endDate) : now.getTime()

    // Get alarm history in parallel if there are multiple alarms
    const alarmsWithHistory = await getAlarmsHistory(
      cloudwatchClient,
      alarms,
      startTimeMs,
      endTimeMs,
    )

    return {
      alarms: alarmsWithHistory,
      totalCount: alarmsWithHistory.length,
      stateCount: countAlarmsByState(alarmsWithHistory),
      timeRange: {
        start: new Date(startTimeMs).toISOString(),
        end: new Date(endTimeMs).toISOString(),
      },
    }
  } catch (error) {
    console.error(`CloudWatch Alarms Error: ${error.message || String(error)}`)

    // Check if this is an AWS credentials error
    const credentialErrorMessage = handleAwsCredentialsError(error, profile)
    if (credentialErrorMessage) {
      throw new Error(credentialErrorMessage)
    }

    throw error
  }
}

/**
 * Describe CloudWatch alarms with optional filtering
 *
 * @param {AwsCloudWatchClient} cloudwatchClient - CloudWatch client
 * @param {Object} params - Parameters for the function
 * @param {string[]} [params.alarmNames] - Optional array of alarm names to retrieve
 * @param {string} [params.alarmNamePrefix] - Optional prefix to filter alarms by name
 * @param {string} [params.alarmState] - Optional alarm state to filter by
 * @returns {Promise<Object[]>} - Array of alarm objects
 */
async function describeAlarms(cloudwatchClient, params) {
  const { alarmNames, alarmNamePrefix, alarmState } = params

  // Prepare parameters for the AWS SDK call
  const describeParams = {}

  if (alarmNames && alarmNames.length > 0) {
    describeParams.AlarmNames = alarmNames
  }

  if (alarmNamePrefix) {
    describeParams.AlarmNamePrefix = alarmNamePrefix
  }

  if (alarmState && alarmState !== 'all') {
    describeParams.StateValue = alarmState
  }

  // Call the AWS SDK to describe alarms
  return await cloudwatchClient.describeAlarms(describeParams)
}

/**
 * Get history for multiple alarms in parallel
 *
 * @param {AwsCloudWatchClient} cloudwatchClient - CloudWatch client
 * @param {Object[]} alarms - Array of alarm objects
 * @param {number} startTimeMs - Start time in milliseconds
 * @param {number} endTimeMs - End time in milliseconds
 * @returns {Promise<Object[]>} - Array of alarms with history
 */
async function getAlarmsHistory(
  cloudwatchClient,
  alarms,
  startTimeMs,
  endTimeMs,
) {
  // Create an array of promises for each alarm's history
  const historyPromises = alarms.map((alarm) => {
    return cloudwatchClient
      .describeAlarmHistory({
        AlarmName: alarm.AlarmName,
        StartDate: new Date(startTimeMs),
        EndDate: new Date(endTimeMs),
        HistoryItemType: 'StateUpdate',
      })
      .then((history) => {
        return {
          ...alarm,
          history: history || [],
        }
      })
  })

  // Execute all history requests in parallel
  return await Promise.all(historyPromises)
}

/**
 * Count alarms by state
 *
 * @param {Object[]} alarms - Array of alarm objects
 * @returns {Object} - Count of alarms by state
 */
function countAlarmsByState(alarms) {
  return alarms.reduce((counts, alarm) => {
    const state = alarm.StateValue || 'UNKNOWN'
    counts[state] = (counts[state] || 0) + 1
    return counts
  }, {})
}
