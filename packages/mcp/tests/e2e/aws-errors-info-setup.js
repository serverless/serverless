/**
 * Setup script for AWS Errors Info E2E tests
 * This script creates and populates log groups with test data
 * Run this script once to set up the test environment
 */
import {
  CloudWatchLogsClient,
  CreateLogGroupCommand,
  DeleteLogGroupCommand,
  PutLogEventsCommand,
  CreateLogStreamCommand,
  GetLogEventsCommand,
} from '@aws-sdk/client-cloudwatch-logs'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

// Get the directory name for this file
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Test configuration
const profile = 'some-profile' // Use some profile for testing
const region = 'us-east-1' // Use a region for testing

// Use a fixed prefix for test log groups so they can be easily identified
const testPrefix = 'test-errors-info-patterns'
// Use log group names that match the format expected by the tool
const logGroupNames = [
  `/aws/lambda/${testPrefix}-function1`,
  `/aws/lambda/${testPrefix}-function2`,
  `/aws/lambda/${testPrefix}-function3`,
]

// We'll use the exact messages from the log-events.json file

// Load test fixtures
const logEventsFixturePath = path.join(__dirname, 'fixtures', 'log-events.json')
const logEventsFixture = JSON.parse(
  fs.readFileSync(logEventsFixturePath, 'utf8'),
)

// Create a CloudWatch Logs client
const cloudWatchLogsClient = new CloudWatchLogsClient({ region, profile })

// Save the log group names to a file for the test to use
const saveLogGroupNames = () => {
  const configData = {
    logGroupNames,
    profile,
    region,
  }
  fs.writeFileSync(
    path.join(__dirname, 'fixtures', 'test-config.json'),
    JSON.stringify(configData, null, 2),
  )
  console.log('Saved test configuration to fixtures/test-config.json')
}

// Main function to set up test environment
async function setupTestEnvironment() {
  try {
    console.log('Setting up test environment for AWS Errors Info E2E tests...')

    // Create test log groups
    for (const logGroupName of logGroupNames) {
      try {
        await cloudWatchLogsClient.send(
          new CreateLogGroupCommand({
            logGroupName,
          }),
        )
        console.log(`Created log group ${logGroupName}`)
      } catch (error) {
        if (error.name === 'ResourceAlreadyExistsException') {
          console.log(
            `Log group ${logGroupName} already exists, skipping creation`,
          )
        } else {
          throw error
        }
      }

      // Wait a moment to ensure log group is created
      await new Promise((resolve) => setTimeout(resolve, 1000))
    }

    // Process log events from fixture file
    const logEvents = []

    // Map each log stream to a log group
    logEventsFixture.forEach((fixture, index) => {
      // Create a log stream for each fixture
      const logGroupName = logGroupNames[index % logGroupNames.length]
      const logStreamName = fixture.logStreamName

      // Process each event in the fixture
      const events = []

      // IMPORTANT: Use current time + 2 minutes as the base for timestamps
      // This ensures timestamps are after log group/stream creation
      // and gives CloudWatch time to index them before they occur
      const now = Date.now()
      // Start with current time + 2 minutes
      let currentTime = now + 2 * 60 * 1000

      for (const event of fixture.events) {
        // Use a predictable timestamp pattern with 1ms increments
        const timestamp = currentTime
        currentTime += 1 // Add just 1 millisecond for each event

        // Use the exact message from the log-events.json file
        const message = event.message

        events.push({
          timestamp,
          message,
        })
      }

      // Ensure events are sorted by timestamp (required by CloudWatch Logs)
      events.sort((a, b) => a.timestamp - b.timestamp)

      // Add to log events array
      logEvents.push({
        logGroupName,
        logStreamName,
        events,
      })
    })

    // Add log events to each log group
    for (const logEvent of logEvents) {
      try {
        // Debug log events
        console.log(
          `Adding log events to ${logEvent.logGroupName}/${logEvent.logStreamName}:`,
        )
        console.log(JSON.stringify(logEvent.events, null, 2))

        // Create log stream first to ensure it exists
        try {
          await cloudWatchLogsClient.send(
            new CreateLogStreamCommand({
              logGroupName: logEvent.logGroupName,
              logStreamName: logEvent.logStreamName,
            }),
          )
          console.log(
            `Created log stream ${logEvent.logStreamName} in ${logEvent.logGroupName}`,
          )
        } catch (streamError) {
          // Ignore if stream already exists
          if (streamError.name === 'ResourceAlreadyExistsException') {
            console.log(
              `Log stream ${logEvent.logStreamName} already exists in ${logEvent.logGroupName}, skipping creation`,
            )
          } else {
            console.error(`Error creating log stream: ${streamError.message}`)
            throw streamError
          }
        }

        // Wait a moment to ensure log stream is ready
        await new Promise((resolve) => setTimeout(resolve, 1000))

        // Check if events already exist in the log stream
        let existingEvents = []
        try {
          const response = await cloudWatchLogsClient.send(
            new GetLogEventsCommand({
              logGroupName: logEvent.logGroupName,
              logStreamName: logEvent.logStreamName,
              limit: 100, // Adjust as needed
            }),
          )
          existingEvents = response.events || []
        } catch (error) {
          console.log(
            `No existing events found or error checking: ${error.message}`,
          )
          existingEvents = []
        }

        // Filter out events that already exist (by message content)
        const existingMessages = new Set(existingEvents.map((e) => e.message))
        const newEvents = logEvent.events.filter(
          (event) => !existingMessages.has(event.message),
        )

        if (newEvents.length === 0) {
          console.log(
            `All events already exist in ${logEvent.logGroupName}/${logEvent.logStreamName}, skipping addition`,
          )
        } else {
          // Add only new log events
          await cloudWatchLogsClient.send(
            new PutLogEventsCommand({
              logGroupName: logEvent.logGroupName,
              logStreamName: logEvent.logStreamName,
              logEvents: newEvents,
            }),
          )
          console.log(
            `Successfully added ${newEvents.length} new events to ${logEvent.logGroupName}/${logEvent.logStreamName}`,
          )
        }
      } catch (error) {
        console.error(`Error adding log events: ${error.message}`)
        console.error(error)
        throw error
      }
    }

    // Save the log group names to a file
    saveLogGroupNames()

    console.log('Test environment setup complete!')
    console.log(
      'Wait at least 2 minutes for logs to be indexed before running tests',
    )
    console.log(`Log groups created: ${logGroupNames.join(', ')}`)
  } catch (error) {
    console.error('Error setting up test environment:', error)
    process.exit(1)
  }
}

// Create a cleanup function that can be run separately
async function cleanupTestEnvironment() {
  try {
    console.log('Cleaning up test environment...')

    for (const logGroupName of logGroupNames) {
      try {
        await cloudWatchLogsClient.send(
          new DeleteLogGroupCommand({
            logGroupName,
          }),
        )
        console.log(`Deleted log group ${logGroupName}`)
      } catch (error) {
        console.error(`Error deleting log group ${logGroupName}:`, error)
      }
    }

    console.log('Test environment cleanup complete!')
  } catch (error) {
    console.error('Error cleaning up test environment:', error)
    process.exit(1)
  }
}

// Check if this script is being run directly
if (process.argv[2] === 'cleanup') {
  cleanupTestEnvironment()
} else {
  setupTestEnvironment()
}
