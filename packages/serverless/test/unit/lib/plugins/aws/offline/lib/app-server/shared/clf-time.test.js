import { formatClfTime } from '../../../../../../../../../lib/plugins/aws/offline/lib/app-server/shared/clf-time.js'

describe('formatClfTime', () => {
  it('formats a Date as dd/Mon/YYYY:HH:MM:SS +0000 in UTC', () => {
    expect(formatClfTime(new Date('2026-05-26T13:45:09Z'))).toBe(
      '26/May/2026:13:45:09 +0000',
    )
  })

  it('zero-pads day, hours, minutes, and seconds', () => {
    expect(formatClfTime(new Date('2026-01-02T03:04:05Z'))).toBe(
      '02/Jan/2026:03:04:05 +0000',
    )
  })

  it('uses 3-letter English month abbreviations', () => {
    const dates = [
      new Date('2026-01-15T00:00:00Z'),
      new Date('2026-02-15T00:00:00Z'),
      new Date('2026-03-15T00:00:00Z'),
      new Date('2026-04-15T00:00:00Z'),
      new Date('2026-05-15T00:00:00Z'),
      new Date('2026-06-15T00:00:00Z'),
      new Date('2026-07-15T00:00:00Z'),
      new Date('2026-08-15T00:00:00Z'),
      new Date('2026-09-15T00:00:00Z'),
      new Date('2026-10-15T00:00:00Z'),
      new Date('2026-11-15T00:00:00Z'),
      new Date('2026-12-15T00:00:00Z'),
    ]
    const abbrs = dates.map((d) => formatClfTime(d).split('/')[1])
    expect(abbrs).toEqual([
      'Jan',
      'Feb',
      'Mar',
      'Apr',
      'May',
      'Jun',
      'Jul',
      'Aug',
      'Sep',
      'Oct',
      'Nov',
      'Dec',
    ])
  })

  it('UTC end-of-year edge: midnight Jan 1', () => {
    expect(formatClfTime(new Date('2026-01-01T00:00:00Z'))).toBe(
      '01/Jan/2026:00:00:00 +0000',
    )
  })

  it('UTC end-of-day edge: 23:59:59 Dec 31', () => {
    expect(formatClfTime(new Date('2026-12-31T23:59:59Z'))).toBe(
      '31/Dec/2026:23:59:59 +0000',
    )
  })
})
