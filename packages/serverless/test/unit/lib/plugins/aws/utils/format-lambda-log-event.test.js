import { stripVTControlCharacters } from 'node:util'
import formatLambdaLogEvent from '../../../../../../lib/plugins/aws/utils/format-lambda-log-event.js'

const REQUEST_ID = 'aaef7922-543b-4401-b1d3-4e71618caa03'
const TIMESTAMP = '2026-01-15T10:20:30.123Z'

const format = (line) => stripVTControlCharacters(formatLambdaLogEvent(line))

// The first line carries the local time, which depends on the machine's time zone.
const body = (line) => format(line).split('\n').slice(1).join('\n')
const heading = (line) => format(line).split('\n')[0]

describe('formatLambdaLogEvent', () => {
  describe('lines that start with the timestamp (Node.js runtimes)', () => {
    test('keeps the level and the message', () => {
      const line = `${TIMESTAMP}\t${REQUEST_ID}\tINFO\tYour cron function ran\n`
      expect(heading(line)).toMatch(
        new RegExp(
          `^\\d{4}-\\d{2}-\\d{2} \\d{2}:\\d{2}:\\d{2}\\.123 - ${REQUEST_ID} - $`,
        ),
      )
      expect(body(line)).toBe('INFO\tYour cron function ran')
    })

    test('keeps a message that repeats the request id', () => {
      const line = `${TIMESTAMP}\t${REQUEST_ID}\tINFO\tretrying ${REQUEST_ID}\tnow`
      expect(body(line)).toBe(`INFO\tretrying ${REQUEST_ID}\tnow`)
    })
  })

  describe('lines that start with the level (Python logging)', () => {
    test('keeps the message', () => {
      const line = `[INFO]\t${TIMESTAMP}\t${REQUEST_ID}\tYour cron function ran\n`
      expect(heading(line)).toMatch(
        new RegExp(
          `^\\d{4}-\\d{2}-\\d{2} \\d{2}:\\d{2}:\\d{2}\\.123 - ${REQUEST_ID} - \\[INFO\\]\\t$`,
        ),
      )
      expect(body(line)).toBe('Your cron function ran')
    })

    test('keeps tabs and line breaks inside the message', () => {
      const line = `[ERROR]\t${TIMESTAMP}\t${REQUEST_ID}\tfirst\tpart\nsecond line`
      expect(body(line)).toBe('first\tpart\nsecond line')
    })

    test('keeps the message of a line logged outside an invocation', () => {
      const line = `[WARNING]\t${TIMESTAMP}\t\tloaded at import time`
      expect(body(line)).toBe('loaded at import time')
    })
  })

  test('returns a line without tab-separated fields unchanged', () => {
    expect(format('plain output from print()\n')).toBe(
      'plain output from print()',
    )
  })

  test('rewrites the START and REPORT lines', () => {
    expect(format(`START RequestId: ${REQUEST_ID} Version: $LATEST\n`)).toBe(
      `START - ${REQUEST_ID} - Version: $LATEST`,
    )
    expect(
      format(
        `REPORT RequestId: ${REQUEST_ID}\tDuration: 2.80 ms\tBilled Duration: 115 ms\t\n`,
      ),
    ).toBe(
      `REPORT - ${REQUEST_ID}\nDuration: 2.80 ms\tBilled Duration: 115 ms\t\n`,
    )
  })
})
