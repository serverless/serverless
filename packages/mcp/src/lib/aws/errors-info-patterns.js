/**
 * AWS Errors Info using Pattern Analytics - Library for analyzing and grouping error patterns in CloudWatch logs
 * This version uses CloudWatch Logs Pattern command for automatic pattern detection
 */
import { AwsCloudWatchClient } from '@serverless/engine/src/lib/aws/cloudwatch.js'
import { AwsCloudformationService } from '@serverless/engine/src/lib/aws/cloudformation.js'
import AwsRestApiGatewayClient from '@serverless/engine/src/lib/aws/restApiGateway.js'
import { AwsHttpApiGatewayClient } from '@serverless/engine/src/lib/aws/httpApiGateway.js'
import { AwsLambdaClient } from '@serverless/engine/src/lib/aws/lambda.js'
import {
  handleExtendedTimeframeConfirmation,
  validateLogGroups,
} from '../confirmation-handler.js'
import { handleAwsCredentialsError } from '../aws-credentials-error-handler.js'

/**
 * Analyzes CloudWatch logs to identify and group similar error patterns using pattern analytics
 *
 * @param {Object} params - Parameters for the function
 * @param {string|number} params.startTime - Start time for logs (ISO string or timestamp)
 * @param {string|number} params.endTime - End time for logs (ISO string or timestamp)
 * @param {string[]} [params.logGroupIdentifiers] - Optional array of CloudWatch Log Group names/ARNs
 * @param {boolean} [params.serviceWideAnalysis] - Boolean flag to analyze all logs for a service
 * @param {string} [params.serviceName] - Required if serviceWideAnalysis is true
 * @param {string} [params.serviceType] - Required if serviceWideAnalysis is true (serverless-framework, cloudformation)
 * @param {number} [params.maxResults] - Optional limit for the number of error groups to return
 * @param {string} [params.region] - AWS region
 * @param {string} [params.profile] - AWS profile
 * @returns {Promise<Object>} - Error groups and summary information
 */
// validateLogGroups is now imported from confirmation-handler.js

export async function getErrorsInfoWithPatterns({
  startTime,
  endTime,
  logGroupIdentifiers,
  serviceWideAnalysis = false,
  serviceName,
  serviceType,
  maxResults = 100,
  region,
  profile,
  confirmationToken,
}) {
  // Initialize AWS config at the beginning of the function
  const awsConfig = { region, profile }
  try {
    // Validate parameters
    if (!startTime || !endTime) {
      throw new Error('startTime and endTime are required')
    }

    // Convert timestamps to milliseconds if they are provided as strings
    const startTimeMs =
      typeof startTime === 'string' ? Date.parse(startTime) : Number(startTime)
    const endTimeMs =
      typeof endTime === 'string' ? Date.parse(endTime) : Number(endTime)

    if (isNaN(startTimeMs) || isNaN(endTimeMs)) {
      throw new Error('Invalid startTime or endTime')
    }

    // Determine which log groups to analyze
    let effectiveLogGroups = []

    if (serviceWideAnalysis) {
      // Validate service parameters
      if (!serviceName || !serviceType) {
        throw new Error(
          'serviceName and serviceType are required for serviceWideAnalysis',
        )
      }

      // Create AWS config with region and/or profile if provided
      const awsConfig = {}
      if (region) awsConfig.region = region
      if (profile) awsConfig.profile = profile

      // Get CloudFormation resources directly
      const cloudformationService = new AwsCloudformationService(awsConfig)
      const resources =
        await cloudformationService.describeStackResources(serviceName)

      // Extract log groups from resources
      effectiveLogGroups = await extractLogGroupsFromResources(
        resources,
        awsConfig,
      )

      if (effectiveLogGroups.length === 0) {
        return {
          summary: {
            totalErrors: 0,
            uniqueErrorGroups: 0,
            timeRange: {
              start: new Date(startTime).toISOString(),
              end: new Date(endTime).toISOString(),
            },
          },
          errorGroups: [],
          message: 'No log groups found for the specified service',
        }
      }
    } else {
      // Use provided log group identifiers
      if (!logGroupIdentifiers || logGroupIdentifiers.length === 0) {
        throw new Error(
          'logGroupIdentifiers is required when serviceWideAnalysis is false',
        )
      }
      effectiveLogGroups = logGroupIdentifiers
    }

    if (effectiveLogGroups.length === 0) {
      return {
        summary: {
          totalErrors: 0,
          uniqueErrorGroups: 0,
          timeRange: {
            start: new Date(startTime).toISOString(),
            end: new Date(endTime).toISOString(),
          },
        },
        errorGroups: [],
        message: 'No log groups specified',
      }
    }

    // If we have log groups to validate, check if they exist
    if (effectiveLogGroups.length > 0) {
      try {
        // Get log groups with size information
        const logGroupsInfo = await validateLogGroups(
          effectiveLogGroups,
          awsConfig,
        )

        // Check for extended timeframe query confirmation (more than 3 hours)
        const extendedTimeframeResponse = handleExtendedTimeframeConfirmation(
          startTimeMs,
          endTimeMs,
          confirmationToken,
          logGroupsInfo, // Pass the log group size information
        )

        if (extendedTimeframeResponse) {
          return extendedTimeframeResponse
        }

        // If we don't need confirmation or it's already confirmed, continue with the validated log groups
        effectiveLogGroups = logGroupsInfo?.logGroups
      } catch (error) {
        console.error('Error validating log groups:', error)
        // If validation fails, return the unvalidated list as a fallback
        return {
          summary: {
            totalErrors: 0,
            uniqueErrorGroups: 0,
            timeRange: {
              start: new Date(startTime).toISOString(),
              end: new Date(endTime).toISOString(),
            },
          },
          errorGroups: [],
          message: 'Error validating log groups: ' + error.message,
        }
      }
    }

    // Build CloudWatch Logs Insights query using pattern analytics
    const queryString = buildPatternAnalyticsQuery()
    // Pattern analytics query

    // Use the specialized pattern analytics query function
    const cloudwatchClient = new AwsCloudWatchClient(awsConfig)
    const queryResult = await cloudwatchClient.executePatternAnalyticsQuery({
      logGroupIdentifiers: effectiveLogGroups,
      startTime: new Date(startTimeMs),
      endTime: new Date(endTimeMs),
      limit: maxResults * 3, // Get more results than needed to account for grouping
    })

    // Throw an error if query errors are encountered
    if (queryResult.errors && queryResult.errors.length) {
      throw new Error(
        `CloudWatch Logs Insights query errors: ${JSON.stringify(queryResult.errors)}`,
      )
    }

    // Use the events directly from the query result
    const transformedResults = {
      events: queryResult.events || [],
    }

    // Extract statistics from the query result
    const statistics = queryResult.statistics

    let errorGroups, totalErrors
    try {
      const result = processPatternResults(transformedResults, maxResults)
      errorGroups = result.errorGroups
      totalErrors = result.totalErrors
    } catch (error) {
      console.error('Error processing pattern results:', error)
      // Provide default values in case of error
      errorGroups = []
      totalErrors = 0
    }

    // Get the actual number of unique error groups from the processed results

    const uniqueErrorGroups = errorGroups.length

    // Extract search terms from patterns for finding specific log groups
    const searchTermsInfo =
      errorGroups.length > 0
        ? 'To find which specific log groups contain particular error, use the aws-logs-search tool with the log group names and a portion of the pattern text (excluding variable parts) as search term.'
        : ''

    return {
      summary: {
        totalErrors,
        uniqueErrorGroups,
        timeRange: {
          start: new Date(startTimeMs).toISOString(),
          end: new Date(endTimeMs).toISOString(),
        },
        logGroups: effectiveLogGroups,
        nextSteps: searchTermsInfo,
        statistics: statistics, // Include statistics in the summary
      },
      errorGroups,
    }
  } catch (error) {
    // Check if this is an AWS credentials error
    const credentialErrorMessage = handleAwsCredentialsError(error, profile)
    return {
      summary: {
        totalErrors: 0,
        uniqueErrorGroups: 0,
        timeRange: {
          start: new Date(startTime).toISOString(),
          end: new Date(endTime).toISOString(),
        },
        logGroups: effectiveLogGroups || [],
        nextSteps: 'Error occurred. No pattern analysis available.',
      },
      errorGroups: [],
      error: credentialErrorMessage || error.message,
      statistics: null, // Include null statistics in error case
    }
  }
}

/**
 * Extracts log groups from CloudFormation resources
 * This processes the structured response from AwsCloudformationService.describeStackResources
 *
 * @param {Object[]} resources - Resources returned from describeStackResources
 * @returns {string[]} - Array of log group names/ARNs
 */
function extractLogGroupsFromCloudFormationResources(resources) {
  const logGroups = []

  // Process Lambda functions
  const lambdaResources = resources.filter(
    (resource) => resource.ResourceType === 'AWS::Lambda::Function',
  )

  lambdaResources.forEach((resource) => {
    logGroups.push(`/aws/lambda/${resource.PhysicalResourceId}`)
  })

  // Process API Gateway
  const apiGatewayResources = resources.filter(
    (resource) => resource.ResourceType === 'AWS::ApiGateway::RestApi',
  )

  apiGatewayResources.forEach((resource) => {
    logGroups.push(`/aws/apigateway/${resource.PhysicalResourceId}`)
  })

  return logGroups
}

/**
 * Extract log groups from resources, fetching actual logging destinations from API Gateway stages
 * @param {Object[]} resources - Resources returned from describeStackResources
 * @param {Object} awsConfig - AWS configuration (region, profile)
 * @returns {Promise<string[]>} - Array of log group identifiers
 */
async function extractLogGroupsFromResources(resources, awsConfig = {}) {
  // Use a Set to avoid duplicate log groups
  const logGroupsSet = new Set()
  const apiGatewayPromises = []
  const lambdaPromises = []

  // Check if resources is an array (successful response from describeStackResources)
  if (Array.isArray(resources)) {
    // First, collect all resources that don't require API calls
    for (const resource of resources) {
      // Look for AWS::Logs::LogGroup resources
      if (resource.ResourceType === 'AWS::Logs::LogGroup') {
        logGroupsSet.add(resource.PhysicalResourceId)
      }

      // For Lambda functions, fetch the actual logging configuration
      if (resource.ResourceType === 'AWS::Lambda::Function') {
        const functionName = resource.PhysicalResourceId
        if (functionName) {
          // Queue up a promise to fetch Lambda logging configuration
          lambdaPromises.push(
            fetchLambdaLogGroups(functionName, awsConfig).catch((err) => {
              console.error(
                `Error fetching Lambda log groups for ${functionName}:`,
                err,
              )
              // No fallback - if we can't get the configuration, we don't want to query non-existent log groups
              return []
            }),
          )
        }
      }

      // For API Gateway APIs, we need to fetch the stage information to get the log group
      if (resource.ResourceType === 'AWS::ApiGateway::RestApi') {
        const apiId = resource.PhysicalResourceId
        if (apiId) {
          // Queue up a promise to fetch REST API stage information
          apiGatewayPromises.push(
            fetchRestApiGatewayLogGroups(apiId, awsConfig).catch((err) => {
              console.error(
                `Error fetching REST API Gateway log groups for ${apiId}:`,
                err,
              )
              return [] // Return empty array on error
            }),
          )
        }
      }

      // For HTTP APIs (API Gateway V2), we need to fetch the stage information
      if (resource.ResourceType === 'AWS::ApiGatewayV2::Api') {
        const apiId = resource.PhysicalResourceId
        if (apiId) {
          // Queue up a promise to fetch HTTP API stage information
          apiGatewayPromises.push(
            fetchHttpApiGatewayLogGroups(apiId, awsConfig).catch((err) => {
              console.error(
                `Error fetching HTTP API Gateway log groups for ${apiId}:`,
                err,
              )
              return [] // Return empty array on error
            }),
          )
        }
      }
    }

    // Wait for all API Gateway and Lambda log group fetches to complete
    const allPromises = [...apiGatewayPromises, ...lambdaPromises]
    if (allPromises.length > 0) {
      const allLogGroups = await Promise.all(allPromises)
      // Flatten the array of arrays and add to logGroupsSet
      allLogGroups.flat().forEach((logGroup) => logGroupsSet.add(logGroup))
    }
  }

  // Validate that log groups exist before returning them
  const logGroupsArray = Array.from(logGroupsSet)

  return logGroupsArray
}

/**
 * Fetch log groups for a Lambda function
 * @param {string} functionName - Lambda function name
 * @param {Object} awsConfig - AWS configuration (region, profile)
 * @returns {Promise<string[]>} - Array of log group names
 */
async function fetchLambdaLogGroups(functionName, awsConfig) {
  const logGroups = []
  const lambdaClient = new AwsLambdaClient(awsConfig)

  try {
    // Get function configuration
    const functionDetails =
      await lambdaClient.getLambdaFunctionDetails(functionName)

    if (functionDetails && functionDetails.Configuration) {
      // Check if logging configuration is available
      if (functionDetails.Configuration.LoggingConfig) {
        // Extract log group from LoggingConfig if available (newer Lambda versions)
        if (functionDetails.Configuration.LoggingConfig.LogGroup) {
          logGroups.push(functionDetails.Configuration.LoggingConfig.LogGroup)
        }
      }

      // For older Lambda versions or if LoggingConfig is not available,
      // we can safely assume the default log group pattern
      if (logGroups.length === 0) {
        logGroups.push(`/aws/lambda/${functionName}`)
      }
    }
  } catch (error) {
    console.error(
      `Error fetching Lambda function details for ${functionName}:`,
      error,
    )
    // No fallback - if we can't get the configuration, we don't want to query non-existent log groups
  }

  return logGroups
}

/**
 * Fetch log groups for a REST API Gateway
 * @param {string} apiId - API Gateway ID
 * @param {Object} awsConfig - AWS configuration (region, profile)
 * @returns {Promise<string[]>} - Array of log group names
 */
async function fetchRestApiGatewayLogGroups(apiId, awsConfig) {
  const logGroups = []
  const restApiGatewayClient = new AwsRestApiGatewayClient(awsConfig)

  try {
    // Get all stages for the API
    const stages = await restApiGatewayClient.getStages(apiId)

    // Extract log group names from each stage
    for (const stage of stages) {
      if (stage.accessLogSettings && stage.accessLogSettings.destinationArn) {
        // Extract log group name from ARN
        // ARN format: arn:aws:logs:region:account-id:log-group:log-group-name:*
        const arnParts = stage.accessLogSettings.destinationArn.split(':')
        if (arnParts.length >= 7) {
          const logGroupName = arnParts.slice(6).join(':').replace(/:\*$/, '')
          logGroups.push(logGroupName)
        }
      }
    }
  } catch (error) {
    console.error(`Error fetching stages for REST API ${apiId}:`, error)
  }

  // No fallback - if no logging is configured, we don't want to query non-existent log groups

  return logGroups
}

/**
 * Fetch log groups for an HTTP API Gateway (API Gateway V2)
 * @param {string} apiId - API Gateway ID
 * @param {Object} awsConfig - AWS configuration (region, profile)
 * @returns {Promise<string[]>} - Array of log group names
 */
async function fetchHttpApiGatewayLogGroups(apiId, awsConfig) {
  const logGroups = []
  const httpApiGatewayClient = new AwsHttpApiGatewayClient(awsConfig)

  try {
    // Get all stages for the API
    const stages = await httpApiGatewayClient.getStages(apiId)

    // Extract log group names from each stage
    for (const stage of stages) {
      if (stage.AccessLogSettings && stage.AccessLogSettings.DestinationArn) {
        // Extract log group name from ARN
        // ARN format: arn:aws:logs:region:account-id:log-group:log-group-name:*
        const arnParts = stage.AccessLogSettings.DestinationArn.split(':')
        if (arnParts.length >= 7) {
          const logGroupName = arnParts.slice(6).join(':').replace(/:\*$/, '')
          logGroups.push(logGroupName)
        }
      }
    }
  } catch (error) {
    console.error(`Error fetching stages for HTTP API ${apiId}:`, error)
  }

  // No fallback - if no logging is configured, we don't want to query non-existent log groups

  return logGroups
}

/**
 * Error filter pattern used for identifying error messages in logs
 * This is exported so it can be reused by other tools like aws-logs-search
 */
export const ERROR_FILTER_PATTERN =
  '(?i)(error|exception|fail|timeout|cannot|crash|fatal|invalid|denied|unauthorized|forbidden|rejected|unhandled|undefined|null|panic|abort|critical|severe|warn|issue|expired|missing|malformed)'

/**
 * Builds a CloudWatch Logs Insights query using pattern command for automatic error grouping
 * @returns {string} - Query string using pattern analytics
 */
function buildPatternAnalyticsQuery() {
  return `
    fields @timestamp, @message, @log
    | filter @message like /${ERROR_FILTER_PATTERN}/
    | pattern @message
    | sort @patternCount desc
    | limit 50
  `
}

/**
 * Processes pattern results from CloudWatch Logs Insights
 * @param {Object} queryResult - Results from CloudWatch Logs Insights query
 * @param {number} maxResults - Maximum number of error groups to return
 * @returns {Object} - Processed error groups and total count
 */
/**
 * Processes results from CloudWatch Logs Insights query to identify error patterns
 * @param {Object} queryResult - Results from CloudWatch Logs Insights query
 * @param {number} maxResults - Maximum number of error groups to return
 * @returns {Object} - Processed error groups and total count
 */
function processPatternResults(queryResult, maxResults) {
  if (!queryResult || !queryResult.events || queryResult.events.length === 0) {
    return { errorGroups: [], totalErrors: 0 }
  }

  // Group events by pattern
  const patternMap = new Map()

  // Process pattern events from CloudWatch pattern command
  let processedEvents = 0
  queryResult.events.forEach((event, index) => {
    // Skip events without a patternId since we're using it as the key
    if (!event.patternId) {
      return
    }

    // Use the pattern directly from the transformed event
    const pattern = event.pattern

    // Skip events without pattern or with empty pattern
    if (!pattern) {
      return
    }

    // Use the patternId directly as the unique key since it's guaranteed to be unique
    const patternKey = event.patternId

    // Make sure we always use the actual error message as the pattern
    // If pattern is missing or is just the patternId, try to extract it from examples
    let actualPattern = pattern
    if (!pattern || pattern === event.patternId) {
      // If we have examples, use the first one as the pattern
      if (event.examples && event.examples.length > 0) {
        actualPattern = event.examples[0]
      }
    }

    // Error filtering is already done in the CloudWatch query

    // Use the count and examples from the transformed event
    const count = event.count || 1
    const examples = event.examples || []

    if (!patternMap.has(patternKey)) {
      patternMap.set(patternKey, {
        count,
        examples: examples.slice(0, 3), // Limit to 3 examples
        patternId: event.patternId,
        pattern: actualPattern, // Use the actual pattern, not the patternId
        regexString: event.regexString,
        ratio: event.ratio,
        relatedPatterns: event.relatedPatterns,
        severityLabel: event.severityLabel,
      })

      processedEvents++
    } else {
      // This shouldn't happen with pattern command, but just in case
      const entry = patternMap.get(patternKey)
      entry.count += count

      // Add any new examples up to a limit of 3
      examples.forEach((example) => {
        if (entry.examples.length < 3 && !entry.examples.includes(example)) {
          entry.examples.push(example)
        }
      })
    }
  })

  // Convert the map to an array of error groups
  const errorGroups = []
  let totalErrors = 0

  // Process each pattern
  patternMap.forEach((data, patternKey) => {
    // Use the pattern we stored in the map, or fall back to examples if available
    let patternText = data.pattern || patternKey

    // If we still don't have a good pattern and have examples, use the first example
    if (
      (patternText === patternKey || patternText.match(/^[0-9a-f]{32}$/)) &&
      data.examples &&
      data.examples.length > 0
    ) {
      patternText = data.examples[0]
    }

    errorGroups.push({
      id: data.patternId
        ? `pattern-${data.patternId}`
        : `error-group-${errorGroups.length + 1}`,
      pattern: patternText,
      count: data.count,
      examples: data.examples,
      patternId: data.patternId || null,
      regexString: data.regexString || null,
      ratio: data.ratio || null,
      relatedPatterns: data.relatedPatterns || [],
      severityLabel: data.severityLabel || null,
    })

    totalErrors += data.count
  })

  // Sort error groups by count (descending)
  errorGroups.sort((a, b) => b.count - a.count)

  // Limit the number of error groups if specified
  const limitedErrorGroups = maxResults
    ? errorGroups.slice(0, maxResults)
    : errorGroups

  return {
    errorGroups: limitedErrorGroups,
    totalErrors,
  }
}

/**
 * Validates if log groups exist in CloudWatch
 * @param {string[]} logGroups - Array of log group names to validate
 * @param {Object} awsConfig - AWS configuration (region, profile)
 * @returns {Promise<string[]>} - Array of existing log group names
 */
// validateLogGroups function has been moved to confirmation-handler.js
