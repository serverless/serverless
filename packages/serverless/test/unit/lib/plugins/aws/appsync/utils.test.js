import { jest } from '@jest/globals'
import {
  getHostedZoneName,
  getWildCardDomainName,
  parseDateTimeOrDuration,
  parseDuration,
} from '../../../../../../lib/plugins/aws/appsync/utils.js'

beforeAll(() => {
  jest.useFakeTimers()
  jest.setSystemTime(new Date('2020-01-01T17:00:00+00:00'))
})

afterAll(() => {
  jest.useRealTimers()
})

describe('parseDuration', () => {
  it('should parse valid duration', () => {
    expect(parseDuration('2d').toString()).toEqual('P2D')
    expect(parseDuration('365d').toString()).toEqual('P365D')
  })

  it('should throw on invalid duration', () => {
    expect(() => parseDuration('foo')).toThrowError()
  })

  it('should auto-fix 1y durations to 365 days', () => {
    expect(parseDuration('1y').toString()).toEqual('P365D')
  })
})

describe('parseDateTimeOrDuration', () => {
  it('should parse valid date', () => {
    expect(
      parseDateTimeOrDuration('2021-12-31T16:57:00+00:00'),
    ).toMatchInlineSnapshot(`"2021-12-31T16:57:00.000+00:00"`)

    expect(parseDateTimeOrDuration('10m')).toMatchInlineSnapshot(
      `"2020-01-01T16:50:00.000+00:00"`,
    )

    expect(parseDateTimeOrDuration('1h')).toMatchInlineSnapshot(
      `"2020-01-01T16:00:00.000+00:00"`,
    )

    expect(function () {
      parseDateTimeOrDuration('foo')
    }).toThrowErrorMatchingInlineSnapshot(`"Invalid date or duration"`)
  })
})

describe('domain', () => {
  describe('getHostedZoneName', () => {
    it('should extract a correct hostedZoneName', () => {
      expect(getHostedZoneName('example.com')).toMatch('example.com.')
      expect(getHostedZoneName('api.example.com')).toMatch('example.com.')
      expect(getHostedZoneName('api.prod.example.com')).toMatch(
        'prod.example.com.',
      )
    })
  })

  describe('getWildCardDomainName', () => {
    it('should extract a correct getWildCardDomainName', () => {
      expect(getWildCardDomainName('api.example.com')).toMatch('*.example.com')
      expect(getWildCardDomainName('api.prod.example.com')).toMatch(
        '*.prod.example.com',
      )
    })
  })
})
