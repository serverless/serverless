// Importing router.js first resolves a pre-existing circular-import ordering
// issue (compose.js -> ./index.js -> router.js -> compose.js): when compose.js
// is the module graph's entry point, router.js's top-level `ComposeRunner`
// reference gets evaluated before compose.js finishes defining it. This
// side-effect import forces the safe evaluation order without altering the
// module under test.
import '../../../../../src/lib/router.js'
import { parseServiceOption } from '../../../../../src/lib/runners/compose/compose.js'

describe('parseServiceOption', () => {
  test('single name', () => {
    expect(parseServiceOption('api')).toEqual(['api'])
  })
  test('comma-separated list', () => {
    expect(parseServiceOption('api,worker')).toEqual(['api', 'worker'])
  })
  test('trims whitespace around names', () => {
    expect(parseServiceOption(' api , worker ')).toEqual(['api', 'worker'])
  })
  test('drops empty segments (trailing/double commas)', () => {
    expect(parseServiceOption('api,,worker,')).toEqual(['api', 'worker'])
  })
  test('undefined/empty -> empty array', () => {
    expect(parseServiceOption(undefined)).toEqual([])
    expect(parseServiceOption('')).toEqual([])
  })
})
