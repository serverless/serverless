import { expect, test } from '@jest/globals'
import {
  formatCursor,
  parseCursor,
} from '../../../../../../../lib/plugins/aws/dev/state/cursor.js'

test('a cursor is the session id and the record number', () => {
  expect(formatCursor('s_3f2a9c1e0b4d', 57)).toBe('s_3f2a9c1e0b4d:57')
  expect(parseCursor('s_3f2a9c1e0b4d:57')).toEqual({
    sessionId: 's_3f2a9c1e0b4d',
    seq: 57,
  })
  expect(parseCursor(' s_3f2a9c1e0b4d:1\n')).toEqual({
    sessionId: 's_3f2a9c1e0b4d',
    seq: 1,
  })
})

test.each([
  ['57'],
  ['s_1:0'],
  ['s_1:-3'],
  ['s_1:1.5'],
  ['s 1:2'],
  [':2'],
  ['s_1:99999999999999999'],
  [''],
  [undefined],
])('%p is not a cursor', (text) => {
  expect(() => parseCursor(text)).toThrow(
    expect.objectContaining({ reason: 'invalid_cursor' }),
  )
})
