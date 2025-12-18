/**
 * Parameter Validator - Helper functions for validating and adjusting parameters
 * based on context such as timeframe duration
 */

/**
 * Format a duration in milliseconds to a human-readable string
 *
 * @param {number} durationMs - Duration in milliseconds
 * @returns {string} - Human-readable duration string
 */
function formatDuration(durationMs) {
  const seconds = Math.floor(durationMs / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)

  if (days > 0) {
    return days === 1 ? '1 day' : `${days} days`
  } else if (hours > 0) {
    return hours === 1 ? '1 hour' : `${hours} hours`
  } else if (minutes > 0) {
    return minutes === 1 ? '1 minute' : `${minutes} minutes`
  } else {
    return seconds === 1 ? '1 second' : `${seconds} seconds`
  }
}

/**
 * Calculates appropriate CloudWatch metrics period based on timeframe duration
 * Automatically increases period for longer timeframes to reduce data points and costs
 *
 * @param {number} startTimeMs - Start time in milliseconds
 * @param {number} endTimeMs - End time in milliseconds
 * @param {number} [defaultPeriod=60] - Default period in seconds
 * @param {number} [maxDataPoints=300] - Maximum number of data points to return
 * @returns {number} - Adjusted period in seconds
 */
export function calculateOptimalPeriod(
  startTimeMs,
  endTimeMs,
  defaultPeriod = 3600,
  maxDataPoints = 300,
) {
  // Calculate timeframe duration in seconds
  const timeframeDurationSec = Math.floor((endTimeMs - startTimeMs) / 1000)

  // Calculate minimum period needed to stay under maxDataPoints
  const minPeriodForDataPoints = Math.ceil(timeframeDurationSec / maxDataPoints)

  // Use the larger of default period or calculated minimum
  let period = Math.max(defaultPeriod, minPeriodForDataPoints)

  // Round up to standard CloudWatch period intervals
  // CloudWatch periods must be multiples of 60 seconds
  if (period <= 60) return 60
  if (period <= 300) return 300 // 5 minutes
  if (period <= 3600) return 3600 // 1 hour
  if (period <= 21600) return 21600 // 6 hours
  if (period <= 86400) return 86400 // 1 day
  if (period <= 172800) return 172800 // 2 days
  if (period <= 259200) return 259200 // 3 days
  if (period <= 604800) return 604800 // 1 week

  // For extremely long timeframes, use 2-week period
  return 1209600 // 2 weeks
}

/**
 * Validates and adjusts timestamp parameters
 *
 * @param {Object} params - Parameters object
 * @param {string|number} [params.startTime] - Start time (ISO string or timestamp)
 * @param {string|number} [params.endTime] - End time (ISO string or timestamp)
 * @param {number} [params.period] - Period in seconds for metrics
 * @returns {Object} - Object with validated and adjusted parameters
 */
export function validateTimeParameters({
  startTime,
  endTime,
  period,
  maxDataPoints = 300,
}) {
  // Parse timestamps
  const startTimeMs = parseTimestamp(startTime)
  const endTimeMs = parseTimestamp(endTime)

  // Validate period if provided - must be a multiple of 60 seconds (CloudWatch requirement)
  if (period !== undefined && period % 60 !== 0) {
    throw new Error(
      `Invalid period: ${period}. Period must be a multiple of 60 seconds.`,
    )
  }

  // Calculate optimal period if not specified
  const adjustedPeriod =
    period ||
    calculateOptimalPeriod(startTimeMs, endTimeMs, 3600, maxDataPoints)

  // Calculate the number of data points that would be generated
  const timeframeDurationSec = Math.floor((endTimeMs - startTimeMs) / 1000)
  const estimatedDataPoints = Math.ceil(timeframeDurationSec / adjustedPeriod)

  // Check if the number of data points exceeds the maximum
  if (estimatedDataPoints > maxDataPoints) {
    // Calculate minimum period needed to fit within maxDataPoints
    let recommendedPeriod = Math.ceil(timeframeDurationSec / maxDataPoints)

    // Round up to the nearest multiple of 60 seconds (CloudWatch requirement)
    recommendedPeriod = Math.ceil(recommendedPeriod / 60) * 60

    const readableDuration = formatDuration(endTimeMs - startTimeMs)

    throw new Error(
      `The requested timeframe of ${readableDuration} would generate ${estimatedDataPoints} data points, ` +
        `which exceeds the maximum of ${maxDataPoints}. ` +
        `Please either reduce your timeframe or increase the period to at least ${recommendedPeriod} seconds ` +
        `(Periods must be multiples of 60 seconds).`,
    )
  }

  return {
    startTimeMs,
    endTimeMs,
    period: adjustedPeriod,
    timeframeDurationMs: endTimeMs - startTimeMs,
  }
}

/**
 * Parse timestamp from various formats
 *
 * @param {string|number} timestamp - Timestamp in ISO string or milliseconds
 * @param {number} defaultValue - Default value if timestamp is undefined
 * @returns {number} - Timestamp in milliseconds
 */
export function parseTimestamp(timestamp, defaultValue) {
  if (timestamp === undefined) {
    return defaultValue
  }

  if (typeof timestamp === 'number') {
    return timestamp
  }

  if (typeof timestamp === 'string') {
    const parsed = Date.parse(timestamp)
    if (!isNaN(parsed)) {
      return parsed
    }
  }

  throw new Error(`Invalid timestamp format: ${timestamp}`)
}

/**
 * Validates and adjusts query parameters based on timeframe
 *
 * @param {Object} params - Parameters object
 * @param {string|number} [params.startTime] - Start time (ISO string or timestamp)
 * @param {string|number} [params.endTime] - End time (ISO string or timestamp)
 * @param {number} [params.period] - Period in seconds for metrics
 * @returns {Object} - Object with validated and adjusted parameters
 */
export function validateAndAdjustParameters(params) {
  const { startTimeMs, endTimeMs, period } = validateTimeParameters(params)

  return {
    startTimeMs,
    endTimeMs,
    period,
  }
}
