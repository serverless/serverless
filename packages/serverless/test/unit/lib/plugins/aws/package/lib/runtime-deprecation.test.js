import { describe, expect, it } from '@jest/globals'
import {
  describeDeprecatedRuntimes,
  RUNTIME_DEPRECATIONS,
} from '../../../../../../../lib/plugins/aws/package/lib/runtime-deprecation.js'

// Packaging warns about runtimes AWS Lambda has deprecated, using the dates AWS
// publishes; `now` is fixed so the outcome does not change with the calendar.
const at = (iso) => new Date(`${iso}T12:00:00Z`)
const URL = 'https://docs.aws.amazon.com/lambda/latest/dg/lambda-runtimes.html'

describe('describeDeprecatedRuntimes', () => {
  it('a deprecated runtime whose create and update blocks are still ahead', () => {
    expect(
      describeDeprecatedRuntimes(
        [{ name: 'hello', runtime: 'nodejs20.x' }],
        at('2026-09-23'),
      ),
    ).toEqual([
      `Function "hello" uses nodejs20.x, which AWS Lambda deprecated on 2026-04-30. Lambda stops allowing new functions on it on 2027-02-01, and updates on 2027-03-03. Move to a supported runtime: ${URL}`,
    ])
  })

  it('creating is already blocked, updating not yet', () => {
    expect(
      describeDeprecatedRuntimes(
        [{ name: 'legacy', runtime: 'nodejs14.x' }],
        at('2026-09-23'),
      ),
    ).toEqual([
      `Function "legacy" uses nodejs14.x, which AWS Lambda deprecated on 2023-12-04. Lambda no longer allows creating functions on it, and stops allowing updates on 2027-03-03. Move to a supported runtime: ${URL}`,
    ])
  })

  it('both blocks have passed', () => {
    expect(
      describeDeprecatedRuntimes(
        [{ name: 'legacy', runtime: 'nodejs14.x' }],
        at('2027-03-03'),
      )[0],
    ).toContain('Lambda no longer allows creating or updating functions on it.')
  })

  it('one warning per runtime, naming every function on it', () => {
    const warnings = describeDeprecatedRuntimes(
      [
        { name: 'a', runtime: 'nodejs18.x' },
        { name: 'b', runtime: 'nodejs24.x' },
        { name: 'c', runtime: 'nodejs18.x' },
      ],
      at('2026-09-23'),
    )
    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toMatch(/^Functions "a", "c" use nodejs18\.x, /)
  })

  it('says when the runtime is the default, which the service never wrote', () => {
    expect(
      describeDeprecatedRuntimes(
        [{ name: 'hello', runtime: 'nodejs20.x', isDefault: true }],
        at('2026-09-23'),
      )[0],
    ).toMatch(
      /^Function "hello" uses nodejs20\.x \(the default when no runtime is set\), which AWS Lambda deprecated on 2026-04-30\./,
    )
  })

  it('nothing for a runtime before its deprecation date, or one not in the schedule', () => {
    expect(
      describeDeprecatedRuntimes(
        [
          { name: 'current', runtime: 'nodejs24.x' },
          { name: 'preview', runtime: 'nodejs26.x' },
        ],
        at('2026-09-23'),
      ),
    ).toEqual([])
  })

  it('a scheduled runtime starts warning on its deprecation date', () => {
    const fn = [{ name: 'svc', runtime: 'nodejs22.x' }]
    expect(describeDeprecatedRuntimes(fn, at('2027-04-29'))).toEqual([])
    expect(describeDeprecatedRuntimes(fn, at('2027-04-30'))).toHaveLength(1)
  })

  it('every schedule entry is three ISO dates in order', () => {
    for (const [runtime, dates] of Object.entries(RUNTIME_DEPRECATIONS)) {
      expect(dates).toHaveLength(3)
      for (const date of dates) expect(date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      expect(dates[1] <= dates[2]).toBe(true)
      expect(runtime).toMatch(/^[a-z]/)
    }
  })
})
