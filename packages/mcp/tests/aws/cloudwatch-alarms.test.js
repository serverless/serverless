/**
 * Jest tests for AWS CloudWatch Alarms Tool
 *
 * This test file directly tests the getCloudWatchAlarmsInfo function, mocking the CloudWatch Alarms
 * functionality to avoid making actual AWS API calls during testing.
 */

import { jest, expect, describe, it, beforeEach } from '@jest/globals'

// Create mock functions
const mockGetCloudWatchAlarms = jest.fn()

// Mock the CloudWatch Alarms module
await jest.unstable_mockModule('../../src/lib/aws/cloudwatch-alarms.js', () => {
  return {
    getCloudWatchAlarms: mockGetCloudWatchAlarms,
  }
})

// Import the function after mocking dependencies
const { getCloudWatchAlarmsInfo } = await import(
  '../../src/tools/aws/aws-cloudwatch-alarms.js'
)

describe('CloudWatch Alarms Tool', () => {
  beforeEach(() => {
    // Reset all mocks before each test
    jest.clearAllMocks()
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  it('should return error when neither alarmNames nor alarmNamePrefix is provided', async () => {
    const result = await getCloudWatchAlarmsInfo({})

    expect(result.isError).toBe(true)
    expect(result.content[0].text).toContain(
      'Please provide either alarmNames or alarmNamePrefix parameter',
    )
    expect(mockGetCloudWatchAlarms).not.toHaveBeenCalled()
  })

  it('should get alarms by name', async () => {
    const mockAlarms = [
      {
        AlarmName: 'test-alarm-1',
        AlarmDescription: 'Test alarm 1',
        StateValue: 'OK',
        MetricName: 'CPUUtilization',
        Namespace: 'AWS/EC2',
        Statistic: 'Average',
        Threshold: 80,
        ComparisonOperator: 'GreaterThanThreshold',
        history: [
          {
            Timestamp: new Date('2023-01-01T00:00:00Z'),
            HistoryItemType: 'StateUpdate',
            HistorySummary: 'State changed from ALARM to OK',
          },
        ],
      },
    ]

    mockGetCloudWatchAlarms.mockResolvedValue({
      alarms: mockAlarms,
      totalCount: 1,
      stateCount: { OK: 1 },
      timeRange: {
        start: '2023-01-01T00:00:00.000Z',
        end: '2023-01-02T00:00:00.000Z',
      },
    })

    const result = await getCloudWatchAlarmsInfo({
      alarmNames: ['test-alarm-1'],
      region: 'us-east-1',
      profile: 'default',
    })

    expect(result.isError).toBeUndefined()
    expect(result.totalCount).toBe(1)
    expect(result.alarms).toEqual(mockAlarms)
    expect(result.content.length).toBeGreaterThanOrEqual(2)
    expect(result.content[0].text).toContain('CloudWatch Alarms Summary')
    expect(result.content[1].text).toContain('test-alarm-1')

    expect(mockGetCloudWatchAlarms).toHaveBeenCalledTimes(1)
    expect(mockGetCloudWatchAlarms).toHaveBeenCalledWith(
      expect.objectContaining({
        alarmNames: ['test-alarm-1'],
        region: 'us-east-1',
        profile: 'default',
      }),
    )
  })

  it('should get alarms by name prefix', async () => {
    const mockAlarms = [
      {
        AlarmName: 'test-prefix-alarm-1',
        StateValue: 'OK',
        history: [],
      },
      {
        AlarmName: 'test-prefix-alarm-2',
        StateValue: 'ALARM',
        history: [],
      },
    ]

    mockGetCloudWatchAlarms.mockResolvedValue({
      alarms: mockAlarms,
      totalCount: 2,
      stateCount: { OK: 1, ALARM: 1 },
      timeRange: {
        start: '2023-01-01T00:00:00.000Z',
        end: '2023-01-02T00:00:00.000Z',
      },
    })

    const result = await getCloudWatchAlarmsInfo({
      alarmNamePrefix: 'test-prefix',
      region: 'us-east-1',
    })

    expect(result.isError).toBeUndefined()
    expect(result.totalCount).toBe(2)
    expect(result.alarms).toEqual(mockAlarms)
    expect(result.content[0].text).toContain('CloudWatch Alarms Summary')
    expect(result.content[0].text).toContain('"totalAlarms": 2')

    expect(mockGetCloudWatchAlarms).toHaveBeenCalledTimes(1)
    expect(mockGetCloudWatchAlarms).toHaveBeenCalledWith(
      expect.objectContaining({
        alarmNamePrefix: 'test-prefix',
        region: 'us-east-1',
      }),
    )
  })

  it('should filter alarms by state', async () => {
    mockGetCloudWatchAlarms.mockResolvedValue({
      alarms: [],
      totalCount: 0,
      stateCount: {},
      timeRange: {
        start: '2023-01-01T00:00:00.000Z',
        end: '2023-01-02T00:00:00.000Z',
      },
    })

    await getCloudWatchAlarmsInfo({
      alarmNames: ['test-alarm'],
      alarmState: 'ALARM',
      region: 'us-east-1',
    })

    expect(mockGetCloudWatchAlarms).toHaveBeenCalledTimes(1)
    expect(mockGetCloudWatchAlarms).toHaveBeenCalledWith(
      expect.objectContaining({
        alarmNames: ['test-alarm'],
        alarmState: 'ALARM',
        region: 'us-east-1',
      }),
    )
  })

  it('should handle date ranges for alarm history', async () => {
    mockGetCloudWatchAlarms.mockResolvedValue({
      alarms: [],
      totalCount: 0,
      stateCount: {},
      timeRange: {
        start: '2023-01-01T00:00:00.000Z',
        end: '2023-01-02T00:00:00.000Z',
      },
    })

    await getCloudWatchAlarmsInfo({
      alarmNamePrefix: 'test',
      startDate: '2023-01-01T00:00:00Z',
      endDate: '2023-01-02T00:00:00Z',
      region: 'us-east-1',
    })

    expect(mockGetCloudWatchAlarms).toHaveBeenCalledTimes(1)
    expect(mockGetCloudWatchAlarms).toHaveBeenCalledWith(
      expect.objectContaining({
        alarmNamePrefix: 'test',
        startDate: '2023-01-01T00:00:00Z',
        endDate: '2023-01-02T00:00:00Z',
        region: 'us-east-1',
      }),
    )
  })

  it('should handle errors from the CloudWatch Alarms library', async () => {
    const testError = new Error('Test error')
    mockGetCloudWatchAlarms.mockRejectedValue(testError)

    const result = await getCloudWatchAlarmsInfo({
      alarmNames: ['test-alarm'],
      region: 'us-east-1',
    })

    expect(result.isError).toBe(true)
    expect(result.content[0].text).toContain(
      'Error retrieving CloudWatch alarms: Test error',
    )
    expect(result.errorDetails).toBe('Test error')
  })

  it('should return a message when no alarms are found', async () => {
    mockGetCloudWatchAlarms.mockResolvedValue({
      alarms: [],
      totalCount: 0,
      stateCount: {},
      timeRange: {
        start: '2023-01-01T00:00:00.000Z',
        end: '2023-01-02T00:00:00.000Z',
      },
    })

    const result = await getCloudWatchAlarmsInfo({
      alarmNamePrefix: 'non-existent',
      region: 'us-east-1',
    })

    expect(result.isError).toBeUndefined()
    expect(result.content[1].text).toContain(
      'No matching CloudWatch alarms found',
    )
  })
})
