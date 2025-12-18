import { getCloudWatchAlarms } from '../../lib/aws/cloudwatch-alarms.js'

/**
 * Get information about AWS CloudWatch Alarms and their history
 *
 * @param {Object} params - Parameters for the function
 * @param {string[]} [params.alarmNames] - Optional array of alarm names to retrieve
 * @param {string} [params.alarmNamePrefix] - Optional prefix to filter alarms by name
 * @param {string} [params.alarmState] - Optional alarm state to filter by (OK, ALARM, INSUFFICIENT_DATA, all)
 * @param {string} [params.startDate] - Optional start date for alarm history (ISO string or timestamp)
 * @param {string} [params.endDate] - Optional end date for alarm history (ISO string or timestamp)
 * @param {string} [params.region] - Optional AWS region
 * @param {string} [params.profile] - Optional AWS profile name
 * @returns {Promise<Object>} - CloudWatch alarms information
 */
export async function getCloudWatchAlarmsInfo(params) {
  const {
    alarmNames,
    alarmNamePrefix,
    alarmState = 'all',
    startDate,
    endDate,
    region,
    profile,
  } = params

  try {
    // Validate input parameters
    if (!alarmNames && !alarmNamePrefix) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                error:
                  'Please provide either alarmNames or alarmNamePrefix parameter.',
              },
              null,
              2,
            ),
          },
        ],
        isError: true,
      }
    }

    // Get CloudWatch alarms and their history
    const alarmsData = await getCloudWatchAlarms({
      alarmNames,
      alarmNamePrefix,
      alarmState: alarmState !== 'all' ? alarmState : undefined,
      startDate,
      endDate,
      region,
      profile,
    })

    // Prepare the response
    const content = []

    // Add summary information
    content.push({
      type: 'text',
      text: JSON.stringify(
        {
          title: 'CloudWatch Alarms Summary',
          timeRange: alarmsData.timeRange,
          totalAlarms: alarmsData.totalCount,
          stateDistribution: alarmsData.stateCount,
        },
        null,
        2,
      ),
    })

    // Add alarms information
    if (alarmsData.alarms.length > 0) {
      // Format alarms for better readability
      const formattedAlarms = alarmsData.alarms.map((alarm) => ({
        name: alarm.AlarmName,
        description: alarm.AlarmDescription,
        state: {
          value: alarm.StateValue,
          reason: alarm.StateReason,
          updatedTimestamp: alarm.StateUpdatedTimestamp,
        },
        metric: {
          name: alarm.MetricName,
          namespace: alarm.Namespace,
          dimensions: alarm.Dimensions,
          statistic: alarm.Statistic,
          period: alarm.Period,
          evaluationPeriods: alarm.EvaluationPeriods,
          threshold: alarm.Threshold,
          comparisonOperator: alarm.ComparisonOperator,
        },
        actions: {
          alarm: alarm.AlarmActions,
          ok: alarm.OKActions,
          insufficientData: alarm.InsufficientDataActions,
        },
        history: (alarm.history || []).map((item) => ({
          timestamp: item.Timestamp,
          type: item.HistoryItemType,
          summary: item.HistorySummary,
          data: item.HistoryData,
        })),
      }))

      content.push({
        type: 'text',
        text: JSON.stringify(
          {
            alarms: formattedAlarms,
          },
          null,
          2,
        ),
      })
    } else {
      content.push({
        type: 'text',
        text: JSON.stringify(
          {
            message:
              'No matching CloudWatch alarms found with the specified criteria.',
          },
          null,
          2,
        ),
      })
    }

    return {
      content,
      alarms: alarmsData.alarms,
      totalCount: alarmsData.totalCount,
      stateCount: alarmsData.stateCount,
      timeRange: alarmsData.timeRange,
    }
  } catch (error) {
    console.error(
      `CloudWatch Alarms Tool Error: ${error.message || String(error)}`,
    )
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              error: `Error retrieving CloudWatch alarms: ${error.message || String(error)}`,
              region: region || 'default',
              profile: profile || 'default',
            },
            null,
            2,
          ),
        },
      ],
      isError: true,
      errorDetails: error.message || String(error),
    }
  }
}
