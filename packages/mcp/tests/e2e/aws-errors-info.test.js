/**
 * Comprehensive E2E tests for the AWS Errors Info tool
 * This test uses pre-created log groups and assumes logs are already indexed
 * Run aws-errors-info-setup.js first to create the test environment
 *
 * This test combines the tool-level testing (getAwsErrorsInfo) with comprehensive
 * validation of the pattern analytics results.
 */
import { jest, expect, describe, test, beforeAll } from '@jest/globals'
import {
  CloudWatchLogsClient,
  DescribeQueriesCommand,
  GetQueryResultsCommand,
} from '@aws-sdk/client-cloudwatch-logs'
import fs from 'fs'
import { writeFile } from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'

// Import the tool function directly
import { getAwsErrorsInfo } from '../../src/tools/aws/errors-info.js'

// Get the directory name for this file
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Load test configuration from file
const testConfigPath = path.join(__dirname, 'fixtures', 'test-config.json')
let testConfig

try {
  testConfig = JSON.parse(fs.readFileSync(testConfigPath, 'utf8'))
  console.log('Loaded test configuration from fixtures/test-config.json')
} catch (error) {
  console.error('Error loading test configuration:', error.message)
  console.error(
    'Please run aws-errors-info-setup.js first to set up the test environment',
  )
  process.exit(1)
}

// Extract configuration from the loaded file
const { logGroupNames, profile, region } = testConfig

// Load test fixtures for expected results
const expectedResultsPath = path.join(
  __dirname,
  'fixtures',
  'expected-results.json',
)
const expectedResults = JSON.parse(fs.readFileSync(expectedResultsPath, 'utf8'))

// Create a CloudWatch Logs client
const cloudWatchLogsClient = new CloudWatchLogsClient({ region, profile })

describe('AWS Errors Info E2E', () => {
  beforeAll(async () => {
    // Verify that the log groups exist
    console.log('Using pre-created log groups:', logGroupNames.join(', '))
    console.log('Assuming logs are already indexed and ready for querying')
  }, 5000) // Short timeout for setup

  test('should group similar errors correctly from pre-created logs with comprehensive validation', async () => {
    // Use a very wide time range to ensure we capture all test events
    // Since we don't know exactly when the logs were created
    const now = Date.now()
    const startTime = new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString() // 7 days ago
    const endTime = new Date(now + 60 * 60 * 1000).toISOString() // current time + 1 hour

    console.log(`Using wide time range to ensure all logs are captured:`)
    console.log(`Time range: ${startTime} to ${endTime}`)
    console.log(`Log groups to search: ${JSON.stringify(logGroupNames)}`)

    // Call the errors-info tool (user-facing tool function)
    const result = await getAwsErrorsInfo({
      startTime,
      endTime,
      logGroupIdentifiers: logGroupNames,
      region,
      profile,
      maxResults: 100,
      // confirmationToken: 'eyJzdGFydFRpbWUiOjE3NDM3MjM2MTE3ODAsImVuZFRpbWUiOjE3NDQzMzIwMTE3ODAsInRpbWVzdGFtcCI6MTc0NDMyODQxMjUwNywidHlwZSI6ImV4dGVuZGVkVGltZWZyYW1lIn0=\\',
    })

    // Verify the results
    console.log(
      'Result from getAwsErrorsInfo:',
      JSON.stringify(result, null, 2),
    )

    // Let's also log the CloudWatch Logs Insights query that was executed
    try {
      // Print recent queries to see what was executed
      console.log(
        'Attempting to get recent CloudWatch Logs Insights queries...',
      )

      // Use the AWS SDK directly to see if there are any recent queries
      const { queries } = await cloudWatchLogsClient.send(
        new DescribeQueriesCommand({
          status: 'Complete',
          maxResults: 1,
        }),
      )

      if (queries && queries.length > 0) {
        console.log('Recent CloudWatch Logs Insights queries:')
        // Store the latest query results
        let latestResults = null

        for (const query of queries) {
          console.log(
            `Query ID: ${query.queryId}, Status: ${query.status}, Created: ${query.createTime}`,
          )
          // Get the query results
          const results = await cloudWatchLogsClient.send(
            new GetQueryResultsCommand({
              queryId: query.queryId,
            }),
          )
          // Removed large query results log to make output more readable
          // console.log('Query results:', JSON.stringify(results, null, 2))

          // Keep track of the latest results
          latestResults = results
        }

        // Save raw query results to a file after all queries are processed
        if (latestResults) {
          try {
            await writeFile(
              path.join(__dirname, 'fixtures/raw-query-results.json'),
              JSON.stringify(latestResults, null, 2),
              'utf8',
            )
            console.log(
              'Raw query results saved to fixtures/raw-query-results.json',
            )
          } catch (err) {
            console.error('Error saving raw query results:', err.message)
          }
        }
      } else {
        console.log('No recent CloudWatch Logs Insights queries found')
      }
    } catch (error) {
      console.error(
        'Error getting CloudWatch Logs Insights query details:',
        error.message,
      )
    }

    // Parse the result from content[0].text JSON string
    let parsedResult = null
    if (
      result &&
      result.content &&
      Array.isArray(result.content) &&
      result.content.length > 0 &&
      result.content[0].text
    ) {
      try {
        parsedResult = JSON.parse(result.content[0].text)
      } catch (e) {
        console.error('Error parsing content as JSON:', e.message)
      }
    }

    // If we successfully parsed the result, use it for validation
    // Otherwise, continue with the original result (which will likely fail)
    const testResult = parsedResult || result

    // Basic validation
    expect(testResult).toBeDefined()
    expect(testResult.summary).toBeDefined()
    expect(testResult.summary.totalErrors).toBeGreaterThan(0)
    expect(testResult.errorGroups).toBeDefined()
    expect(testResult.errorGroups.length).toBeGreaterThan(0)

    // Compare with expected results, excluding dynamic fields
    expect(testResult.summary.uniqueErrorGroups).toEqual(
      expectedResults.summary.uniqueErrorGroups,
    )
    expect(testResult.summary.totalErrors).toEqual(
      expectedResults.summary.totalErrors,
    )

    // Verify that we have the same number of error groups
    expect(testResult.errorGroups.length).toEqual(
      expectedResults.errorGroups.length,
    )

    // For each expected error group, find the matching group in the results by pattern
    expectedResults.errorGroups.forEach((expectedGroup) => {
      // Find the matching group in the results by comparing pattern exactly, including placeholders
      const matchingGroup = testResult.errorGroups.find((group) => {
        return group.pattern === expectedGroup.pattern
      })

      // Ensure we found a matching group
      expect(matchingGroup).toBeDefined()

      // Compare fields with exact matches
      // Count should match exactly
      expect(matchingGroup.count).toEqual(expectedGroup.count)

      // Examples should match exactly
      expect(matchingGroup.examples).toEqual(expectedGroup.examples)

      // Comprehensive validation of pattern analytics fields
      // regexString should match exactly
      expect(matchingGroup.regexString).toEqual(expectedGroup.regexString)
      // Ratio can vary between test runs, so just verify it's a number between 0 and 1
      expect(typeof matchingGroup.ratio).toBe('number')
      expect(matchingGroup.ratio).toBeGreaterThan(0)
      expect(matchingGroup.ratio).toBeLessThanOrEqual(1)
      expect(matchingGroup.severityLabel).toEqual(expectedGroup.severityLabel)

      // Validate that dynamic fields are present but don't compare values
      expect(matchingGroup.patternId).toBeDefined()
      expect(Array.isArray(matchingGroup.relatedPatterns)).toBe(true)
    })

    // No need for additional pattern checks since we're already doing comprehensive validation
    // against the expected-results.json file above, which ensures all patterns are present
    // with the correct attributes
  }, 180000) // Increase timeout for test to 3 minutes
})
