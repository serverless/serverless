/**
 * Cleanup script for AWS Errors Info E2E tests
 * This script deletes the test log groups created by aws-errors-info-setup.js
 */
import {
  CloudWatchLogsClient,
  DeleteLogGroupCommand,
} from '@aws-sdk/client-cloudwatch-logs'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

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

// Create a CloudWatch Logs client
const cloudWatchLogsClient = new CloudWatchLogsClient({ region, profile })

// Main function to clean up test environment
async function cleanupTestEnvironment() {
  try {
    console.log('Cleaning up test environment for AWS Errors Info E2E tests...')

    // Delete test log groups
    for (const logGroupName of logGroupNames) {
      try {
        await cloudWatchLogsClient.send(
          new DeleteLogGroupCommand({
            logGroupName,
          }),
        )
        console.log(`Deleted log group ${logGroupName}`)
      } catch (error) {
        console.error(
          `Error deleting log group ${logGroupName}:`,
          error.message,
        )
      }
    }

    console.log('Test environment cleanup complete!')
  } catch (error) {
    console.error('Error cleaning up test environment:', error)
    process.exit(1)
  }
}

// Run the cleanup
cleanupTestEnvironment()
