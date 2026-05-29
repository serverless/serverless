import { jsonPath } from '../../../../../../../../../../lib/plugins/aws/offline/lib/app-server/rest-api/velocity/json-path.js'

describe('jsonPath', () => {
  it('returns the root for "$"', () => {
    const value = { a: 1 }
    expect(jsonPath(value, '$')).toBe(value)
  })

  it('returns a top-level key for "$.a"', () => {
    expect(jsonPath({ a: 1 }, '$.a')).toBe(1)
  })

  it('returns a nested key for "$.a.b"', () => {
    expect(jsonPath({ a: { b: 'x' } }, '$.a.b')).toBe('x')
  })

  it('returns an array element for "$.list[0]"', () => {
    expect(jsonPath({ list: ['x', 'y'] }, '$.list[0]')).toBe('x')
  })

  it('returns a nested array element for "$.a.b[1].c"', () => {
    expect(
      jsonPath({ a: { b: [{ c: 'first' }, { c: 'second' }] } }, '$.a.b[1].c'),
    ).toBe('second')
  })

  it('returns undefined when a key is missing', () => {
    expect(jsonPath({ a: 1 }, '$.b')).toBeUndefined()
  })

  it('returns undefined when a chain breaks on undefined', () => {
    expect(jsonPath({ a: { b: null } }, '$.a.b.c')).toBeUndefined()
  })

  it('treats a path without leading "$" as relative to root (same behavior)', () => {
    expect(jsonPath({ a: 1 }, 'a')).toBe(1)
  })

  it('returns the entire value when the path is empty string', () => {
    const value = { a: 1 }
    expect(jsonPath(value, '')).toBe(value)
  })

  it('supports [*] wildcard returning all matches', () => {
    expect(jsonPath({ list: [{ a: 1 }, { a: 2 }] }, '$.list[*].a')).toEqual([
      1, 2,
    ])
  })

  it('supports recursive descent ..', () => {
    expect(jsonPath({ a: { b: { x: 9 } }, x: 1 }, '$..x').sort()).toEqual([
      1, 9,
    ])
  })

  it('supports bracket-quoted keys', () => {
    expect(jsonPath({ 'a-b': 7 }, "$['a-b']")).toBe(7)
  })

  it('returns undefined when no match', () => {
    expect(jsonPath({ a: 1 }, '$.missing')).toBeUndefined()
  })

  it('supports array slices', () => {
    expect(jsonPath({ list: ['a', 'b', 'c', 'd'] }, '$.list[1:3]')).toEqual([
      'b',
      'c',
    ])
  })

  it('returns an array even for a single recursive-descent match', () => {
    expect(jsonPath({ a: { b: { x: 9 } } }, '$..x')).toEqual([9])
  })
})
