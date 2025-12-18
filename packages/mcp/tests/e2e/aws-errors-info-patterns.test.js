/**
 * E2E tests for the AWS Errors Info with Pattern Analytics
 * This test uses pre-created log groups and assumes logs are already indexed
 * Run aws-errors-info-setup.js first to create the test environment
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { getErrorsInfoWithPatterns } from '../../src/lib/aws/errors-info-patterns.js'

// Get the directory name for this file
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Test configuration
const profile = 'some-profile' // Use some profile for testing
const region = 'us-east-1' // Use a region for testing

// Load test configuration from file
let logGroupNames = []
try {
  const testConfig = JSON.parse(
    fs.readFileSync(
      path.join(__dirname, 'fixtures', 'test-config.json'),
      'utf8',
    ),
  )
  logGroupNames = testConfig.logGroupNames
  console.log('Loaded test configuration from fixtures/test-config.json')
} catch (err) {
  console.error('Error loading test configuration:', err)
  console.log('Please run npm run test:aws-errors-info:setup first')
  process.exit(1)
}

describe('AWS Errors Info Pattern Analytics E2E', () => {
  beforeAll(async () => {
    // Verify that the log groups exist
    console.log('Using pre-created log groups:', logGroupNames.join(', '))
    console.log('Assuming logs are already indexed and ready for querying')
  })

  it('should identify error patterns automatically using CloudWatch pattern analytics', async () => {
    // Set time range to ensure all logs are captured
    // Use April 9th 2025 midnight as start time and now + 1 hour as end time
    const now = new Date()
    const endTime = new Date(now.getTime() + 60 * 60 * 1000) // Now + 1 hour
    const startTime = new Date('2025-04-09T00:00:00.000Z') // April 9th 2025 midnight

    console.log('Using wide time range to ensure all logs are captured:')
    console.log(
      `Time range: ${startTime.toISOString()} to ${endTime.toISOString()}`,
    )
    console.log(`Log groups to search: ${JSON.stringify(logGroupNames)}`)

    // Call the function with pattern analytics
    const result = await getErrorsInfoWithPatterns({
      startTime: startTime.getTime(),
      endTime: endTime.getTime(),
      logGroupIdentifiers: logGroupNames,
      maxResults: 10,
      region,
      profile,
    })

    console.log(
      'Result from getErrorsInfoWithPatterns:',
      JSON.stringify(result, null, 2),
    )

    // Save the results to actual-results.json for future reference
    fs.writeFileSync(
      path.join(__dirname, 'fixtures', 'actual-results.json'),
      JSON.stringify(result, null, 2),
      'utf8',
    )
    console.log('Saved results to fixtures/actual-results.json')

    // Load expected results
    const expectedResultsPath = path.join(
      __dirname,
      'fixtures',
      'expected-results.json',
    )
    const expectedResults = JSON.parse(
      fs.readFileSync(expectedResultsPath, 'utf8'),
    )

    // Basic validation
    expect(result).toBeDefined()
    expect(result.summary).toBeDefined()
    expect(result.summary.totalErrors).toBeGreaterThan(0)
    expect(result.errorGroups).toBeDefined()
    expect(result.errorGroups.length).toBeGreaterThan(0)

    // Compare with expected results, excluding dynamic fields
    expect(result.summary.uniqueErrorGroups).toEqual(
      expectedResults.summary.uniqueErrorGroups,
    )
    expect(result.summary.totalErrors).toEqual(
      expectedResults.summary.totalErrors,
    )

    // Verify that we have the same number of error groups
    expect(result.errorGroups.length).toEqual(
      expectedResults.errorGroups.length,
    )

    // For each expected error group, find the matching group in the results by pattern
    expectedResults.errorGroups.forEach((expectedGroup) => {
      // Find the matching group in the results
      const matchingGroup = result.errorGroups.find(
        (group) => group.pattern === expectedGroup.pattern,
      )

      // Ensure we found a matching group
      expect(matchingGroup).toBeDefined()

      // Compare stable fields
      expect(matchingGroup.count).toEqual(expectedGroup.count)

      // Compare examples (order might be different, so sort them first)
      const sortedActualExamples = [...matchingGroup.examples].sort()
      const sortedExpectedExamples = [...expectedGroup.examples].sort()
      expect(sortedActualExamples).toEqual(sortedExpectedExamples)

      expect(matchingGroup.regexString).toEqual(expectedGroup.regexString)
      expect(matchingGroup.ratio).toEqual(expectedGroup.ratio)
      expect(matchingGroup.severityLabel).toEqual(expectedGroup.severityLabel)

      // Validate that dynamic fields are present but don't compare values
      expect(matchingGroup.patternId).toBeDefined()
      expect(Array.isArray(matchingGroup.relatedPatterns)).toBe(true)
    })

    // Check for expected error patterns
    // We should have connection timeout errors
    const connectionTimeoutGroup = result.errorGroups.find((group) =>
      group.pattern.toLowerCase().includes('connection timeout'),
    )
    expect(connectionTimeoutGroup).toBeDefined()

    // Check invalid input group
    const invalidInputGroup = result.errorGroups.find((group) =>
      group.pattern.toLowerCase().includes('invalid input'),
    )
    expect(invalidInputGroup).toBeDefined()

    // Check TypeError groups - we should have both formats
    const typeErrorPropertyGroup = result.errorGroups.find((group) =>
      group.pattern.toLowerCase().includes('cannot read property'),
    )
    expect(typeErrorPropertyGroup).toBeDefined()
    expect(typeErrorPropertyGroup.count).toBe(1)

    const typeErrorPropertiesGroup = result.errorGroups.find((group) =>
      group.pattern.toLowerCase().includes('cannot read properties'),
    )
    expect(typeErrorPropertiesGroup).toBeDefined()
    expect(typeErrorPropertiesGroup.count).toBe(2)
  }, 180000) // Increase timeout for test to 3 minutes
})
