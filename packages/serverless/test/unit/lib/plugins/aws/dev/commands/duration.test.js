import { describe, expect, test } from '@jest/globals'
import {
  durationText,
  parseDuration,
} from '../../../../../../../lib/plugins/aws/dev/commands/duration.js'

describe('durations on the command line', () => {
  test.each([
    ['100s', 100_000],
    ['5m', 300_000],
    ['1h', 3_600_000],
    ['90m', 5_400_000],
    [' 7m ', 420_000],
    // A bare whole number is seconds.
    ['120', 120_000],
    ['100', 100_000],
    [' 90 ', 90_000],
    [120, 120_000],
  ])('%p is %d ms', (text, ms) => {
    expect(parseDuration(text, { option: 'timeout' })).toBe(ms)
  })

  test.each([
    '',
    '   ',
    'soon',
    '1.5m',
    '-5s',
    '5 m',
    '1d',
    '0s',
    undefined,
    // Bare numbers: seconds, but only whole and not negative.
    '-5',
    'NaN',
    '1.5',
    '1.5.3',
    '1e3',
    '0x10',
    '+5',
  ])('%p is refused, naming the option', (text) => {
    expect(() => parseDuration(text, { option: 'timeout' })).toThrow(
      expect.objectContaining({
        code: 'DEV_MODE_INVALID_DURATION',
        message:
          'Option "--timeout" takes a duration such as 100 or 100s (seconds), 5m or 1h.',
      }),
    )
  })

  test('0 turns something off only where the option allows it', () => {
    expect(
      parseDuration('0', { option: 'idle-timeout', allowZero: true }),
    ).toBe(0)
    expect(
      parseDuration('0s', { option: 'idle-timeout', allowZero: true }),
    ).toBe(0)
    expect(() => parseDuration('0', { option: 'timeout' })).toThrow(
      'Option "--timeout" takes a duration such as 100 or 100s (seconds), 5m or 1h.',
    )
    expect(() =>
      parseDuration('x', { option: 'idle-timeout', allowZero: true }),
    ).toThrow(
      'Option "--idle-timeout" takes a duration such as 100 or 100s (seconds), 5m or 1h, or 0 to turn it off.',
    )
  })

  test('a maximum is enforced and named', () => {
    expect(parseDuration('60m', { option: 'timeout', maxMs: 3_600_000 })).toBe(
      3_600_000,
    )
    expect(parseDuration('3600', { option: 'timeout', maxMs: 3_600_000 })).toBe(
      3_600_000,
    )
    expect(() =>
      parseDuration('3601', { option: 'timeout', maxMs: 3_600_000 }),
    ).toThrow('Option "--timeout" can be at most 1h.')
    expect(() =>
      parseDuration('61m', { option: 'timeout', maxMs: 3_600_000 }),
    ).toThrow(
      expect.objectContaining({
        code: 'DEV_MODE_INVALID_DURATION',
        message: 'Option "--timeout" can be at most 1h.',
      }),
    )
  })

  test('without a maximum of its own, a duration stays within what a timer can wait', () => {
    expect(parseDuration('596h', { option: 'timeout' })).toBe(596 * 3_600_000)
    for (const text of ['600h', '9999999h', '2147484s', '2147484', '9999999']) {
      expect(() => parseDuration(text, { option: 'timeout' })).toThrow(
        expect.objectContaining({
          code: 'DEV_MODE_INVALID_DURATION',
          message: 'Option "--timeout" can be at most 596h.',
        }),
      )
    }
    // An option's own maximum below that one still applies.
    expect(() =>
      parseDuration('2h', { option: 'timeout', maxMs: 3_600_000 }),
    ).toThrow('Option "--timeout" can be at most 1h.')
  })

  test('durations print in their largest whole unit', () => {
    expect(durationText(100_000)).toBe('100s')
    expect(durationText(300_000)).toBe('5m')
    expect(durationText(3_600_000)).toBe('1h')
    expect(durationText(90_000)).toBe('90s')
  })
})
