'use strict'

import {
  describe,
  it,
  expect,
  jest,
  beforeEach,
  afterEach,
} from '@jest/globals'
import {
  parseTimeAgo,
  formatLogEvent,
  getRuntimeLogGroupPrefix,
} from '../../../../../../../lib/plugins/aws/bedrock-agentcore/commands/logs.js'

describe('commands/logs', () => {
  describe('parseTimeAgo', () => {
    let realDateNow
    const mockNow = 1704067200000 // 2024-01-01T00:00:00.000Z

    beforeEach(() => {
      realDateNow = Date.now
      Date.now = jest.fn(() => mockNow)
    })

    afterEach(() => {
      Date.now = realDateNow
    })

    it('should return 1 hour ago when no time string provided', () => {
      const result = parseTimeAgo(undefined)
      expect(result).toBe(mockNow - 60 * 60 * 1000)
    })

    it('should parse minutes correctly', () => {
      const result = parseTimeAgo('30m')
      expect(result).toBe(mockNow - 30 * 60 * 1000)
    })

    it('should parse hours correctly', () => {
      const result = parseTimeAgo('2h')
      expect(result).toBe(mockNow - 2 * 60 * 60 * 1000)
    })

    it('should parse days correctly', () => {
      const result = parseTimeAgo('3d')
      expect(result).toBe(mockNow - 3 * 24 * 60 * 60 * 1000)
    })

    it('should parse ISO date string correctly', () => {
      const result = parseTimeAgo('2023-12-31T00:00:00.000Z')
      expect(result).toBe(new Date('2023-12-31T00:00:00.000Z').getTime())
    })

    it('should parse simple date string correctly', () => {
      const result = parseTimeAgo('2023-12-25')
      expect(result).toBe(new Date('2023-12-25').getTime())
    })

    it('should return default 1 hour ago for invalid time string', () => {
      const result = parseTimeAgo('invalid')
      expect(result).toBe(mockNow - 60 * 60 * 1000)
    })
  })

  describe('formatLogEvent', () => {
    it('should format log event with timestamp and message', () => {
      const event = {
        timestamp: 1704067200000, // 2024-01-01T00:00:00.000Z
        message: 'Test log message',
      }

      const result = formatLogEvent(event)
      expect(result).toBe('[2024-01-01T00:00:00.000Z] Test log message')
    })

    it('should trim whitespace from message', () => {
      const event = {
        timestamp: 1704067200000,
        message: '  Test message with whitespace  \n',
      }

      const result = formatLogEvent(event)
      expect(result).toBe(
        '[2024-01-01T00:00:00.000Z] Test message with whitespace',
      )
    })
  })

  describe('getRuntimeLogGroupPrefix', () => {
    it('should return correct log group prefix for runtime ID', () => {
      const runtimeId = 'abc123'
      const result = getRuntimeLogGroupPrefix(runtimeId)
      expect(result).toBe('/aws/bedrock-agentcore/runtimes/abc123')
    })

    it('should handle runtime IDs with special characters', () => {
      const runtimeId = 'runtime-id-with-dashes'
      const result = getRuntimeLogGroupPrefix(runtimeId)
      expect(result).toBe(
        '/aws/bedrock-agentcore/runtimes/runtime-id-with-dashes',
      )
    })
  })
})
