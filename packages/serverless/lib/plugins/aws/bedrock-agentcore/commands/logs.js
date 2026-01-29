'use strict'

/**
 * Log fetching functionality for AgentCore runtimes.
 *
 * Provides utilities for fetching and displaying logs from deployed
 * AgentCore runtimes via AWS CLI.
 */

import { spawnSync, spawn } from 'child_process'

/**
 * Parse a time string like "1h", "30m", "5d" to a timestamp (milliseconds since epoch)
 *
 * Supported formats:
 * - "30m" - 30 minutes ago
 * - "1h" - 1 hour ago
 * - "2d" - 2 days ago
 * - ISO date string - "2024-01-01" or "2024-01-01T00:00:00Z"
 *
 * @param {string|undefined} timeStr - Time string to parse
 * @returns {number} Timestamp in milliseconds
 */
export function parseTimeAgo(timeStr) {
  if (!timeStr) {
    return Date.now() - 60 * 60 * 1000 // Default 1 hour
  }

  const match = timeStr.match(/^(\d+)([mhd])$/)
  if (match) {
    const value = parseInt(match[1], 10)
    const unit = match[2]
    const multipliers = {
      m: 60 * 1000,
      h: 60 * 60 * 1000,
      d: 24 * 60 * 60 * 1000,
    }

    return Date.now() - value * multipliers[unit]
  }

  // Try parsing as date
  const date = new Date(timeStr)
  if (!isNaN(date.getTime())) {
    return date.getTime()
  }

  return Date.now() - 60 * 60 * 1000 // Default 1 hour
}

/**
 * List log groups matching a prefix
 *
 * @param {string} logGroupPrefix - The log group name prefix to search for
 * @param {string} region - AWS region
 * @returns {Array} Array of log group objects
 * @throws {Error} If AWS CLI fails or returns error
 */
export function listLogGroups(logGroupPrefix, region) {
  const listArgs = [
    'logs',
    'describe-log-groups',
    '--log-group-name-prefix',
    logGroupPrefix,
    '--region',
    region,
    '--output',
    'json',
  ]

  const listResult = spawnSync('aws', listArgs, { encoding: 'utf-8' })

  if (listResult.error) {
    throw listResult.error
  }
  if (listResult.status !== 0) {
    throw new Error(
      listResult.stderr || `AWS CLI exited with code ${listResult.status}`,
    )
  }

  const logGroups = JSON.parse(listResult.stdout)
  return logGroups.logGroups || []
}

/**
 * Fetch log events from a log group
 *
 * @param {object} options - Options object
 * @param {string} options.logGroupName - Name of the log group
 * @param {string} options.region - AWS region
 * @param {number} options.startTime - Start timestamp in milliseconds
 * @param {string} [options.filterPattern] - Optional filter pattern
 * @returns {Array} Array of log event objects
 * @throws {Error} If AWS CLI fails or returns error
 */
export function fetchLogEvents({
  logGroupName,
  region,
  startTime,
  filterPattern,
}) {
  const logsArgs = [
    'logs',
    'filter-log-events',
    '--log-group-name',
    logGroupName,
    '--start-time',
    startTime.toString(),
    '--region',
    region,
    ...(filterPattern ? ['--filter-pattern', filterPattern] : []),
    '--output',
    'json',
  ]

  const logsResult = spawnSync('aws', logsArgs, { encoding: 'utf-8' })

  if (logsResult.error) {
    throw logsResult.error
  }
  if (logsResult.status !== 0) {
    throw new Error(
      logsResult.stderr || `AWS CLI exited with code ${logsResult.status}`,
    )
  }

  const events = JSON.parse(logsResult.stdout)
  return events.events || []
}

/**
 * Start tailing logs (streaming mode)
 *
 * @param {object} options - Options object
 * @param {string} options.logGroupName - Name of the log group
 * @param {string} options.region - AWS region
 * @param {string} [options.filterPattern] - Optional filter pattern
 * @returns {Promise<void>} Resolves when tail process exits
 */
export function tailLogs({ logGroupName, region, filterPattern }) {
  const tailArgs = [
    'logs',
    'tail',
    logGroupName,
    '--follow',
    '--region',
    region,
    ...(filterPattern ? ['--filter-pattern', filterPattern] : []),
  ]

  const tailCmd = spawn('aws', tailArgs, { stdio: 'inherit' })

  // Handle graceful shutdown
  process.on('SIGINT', () => {
    tailCmd.kill()
    process.exit(0)
  })

  return new Promise((resolve) => {
    tailCmd.on('close', resolve)
  })
}

/**
 * Format a log event for display
 *
 * @param {object} event - Log event object with timestamp and message
 * @returns {string} Formatted log line
 */
export function formatLogEvent(event) {
  const timestamp = new Date(event.timestamp).toISOString()
  const message = event.message.trim()
  return `[${timestamp}] ${message}`
}

/**
 * Get the log group prefix for an AgentCore runtime
 *
 * @param {string} runtimeId - The runtime ID
 * @returns {string} Log group prefix
 */
export function getRuntimeLogGroupPrefix(runtimeId) {
  return `/aws/bedrock-agentcore/runtimes/${runtimeId}`
}
