import { parseJsonSafe } from '../../../../../../../../../lib/plugins/aws/offline/lib/app-server/shared/json-utils.js'

describe('parseJsonSafe', () => {
  it('parses a valid JSON object string', () => {
    expect(parseJsonSafe('{"a":1}')).toEqual({ a: 1 })
  })

  it('returns null for invalid JSON', () => {
    expect(parseJsonSafe('not-json{')).toBeNull()
  })

  it('returns null for empty string', () => {
    expect(parseJsonSafe('')).toBeNull()
  })

  it('returns null for non-string input', () => {
    expect(parseJsonSafe(undefined)).toBeNull()
    expect(parseJsonSafe(null)).toBeNull()
    expect(parseJsonSafe(42)).toBeNull()
    expect(parseJsonSafe({})).toBeNull()
  })

  it('returns null when JSON parses to a non-object (e.g. a number, string, null)', () => {
    expect(parseJsonSafe('42')).toBeNull()
    expect(parseJsonSafe('"hello"')).toBeNull()
    expect(parseJsonSafe('null')).toBeNull()
  })

  it('parses a JSON array (arrays are objects in JS)', () => {
    expect(parseJsonSafe('[1,2,3]')).toEqual([1, 2, 3])
  })
})
