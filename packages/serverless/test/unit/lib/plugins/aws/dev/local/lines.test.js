import { describe, expect, test } from '@jest/globals'
import {
  PARTIAL_LINE_FLUSH_MS,
  PARTIAL_LINE_LIMIT,
  createLineSplitter,
} from '../../../../../../../lib/plugins/aws/dev/local/lines.js'

/** Timers a test fires by hand. */
const manualTimers = () => {
  const pending = new Set()
  return {
    pending,
    setTimeout(callback, ms) {
      const handle = { callback, ms }
      pending.add(handle)
      return handle
    },
    clearTimeout(handle) {
      pending.delete(handle)
    },
    fireAll() {
      for (const handle of [...pending]) {
        pending.delete(handle)
        handle.callback()
      }
    },
  }
}

const splitter = () => {
  const timers = manualTimers()
  const lines = []
  const split = createLineSplitter({
    timers,
    onLine: (line) => lines.push(line),
  })
  return { timers, lines, split }
}

describe('handler output lines', () => {
  test('splits on LF and CRLF, across chunks', () => {
    const { lines, split, timers } = splitter()
    split.push('one\r\ntw')
    split.push('o\r')
    split.push('\nthree\n')
    expect(lines).toEqual(['one', 'two', 'three'])
    expect(timers.pending.size).toBe(0)
  })

  test('shows a line without a newline once it has waited the flush time, with no empty line after it', () => {
    const { lines, split, timers } = splitter()
    split.push('Downloading...')
    expect(lines).toEqual([])
    expect([...timers.pending].map((handle) => handle.ms)).toEqual([
      PARTIAL_LINE_FLUSH_MS,
    ])
    timers.fireAll()
    expect(lines).toEqual(['Downloading...'])
    split.push('\n')
    split.push(' done\n')
    expect(lines).toEqual(['Downloading...', ' done'])
    expect(timers.pending.size).toBe(0)
  })

  test('a progress bar redrawn with carriage returns shows its latest state', () => {
    const { lines, split, timers } = splitter()
    split.push('\r 10%|#         |')
    split.push('\r 50%|#####     |')
    timers.fireAll()
    split.push('\r100%|##########|\n')
    expect(lines).toEqual([' 50%|#####     |', '100%|##########|'])
  })

  test('a long write without a newline is shown in pieces of the size cap, without waiting', () => {
    const { lines, split, timers } = splitter()
    const total = PARTIAL_LINE_LIMIT * 64 + 10
    let written = 0
    // 64 KiB-ish chunks, the way a pipe delivers them.
    while (written < total) {
      const size = Math.min(65_000, total - written)
      split.push('x'.repeat(size))
      written += size
    }
    expect(lines).toHaveLength(64)
    expect(lines.every((line) => line.length === PARTIAL_LINE_LIMIT)).toBe(true)
    split.end()
    expect(lines).toHaveLength(65)
    expect(lines[64]).toBe('x'.repeat(10))
    expect(timers.pending.size).toBe(0)
  })

  test('a 64 MB write without a newline takes linear time', () => {
    const { lines, split } = splitter()
    const chunk = 'y'.repeat(64 * 1024)
    const startedAt = Date.now()
    for (let index = 0; index < 1024; index += 1) split.push(chunk)
    split.end()
    expect(Date.now() - startedAt).toBeLessThan(5_000)
    expect(lines.join('').length).toBe(64 * 1024 * 1024)
  })

  test('end shows what is left and leaves no timer; later output is shown at once', () => {
    const { lines, split, timers } = splitter()
    split.push('last words')
    split.end()
    expect(lines).toEqual(['last words'])
    expect(timers.pending.size).toBe(0)
    split.push('straggler')
    expect(lines).toEqual(['last words', 'straggler'])
    expect(timers.pending.size).toBe(0)
  })

  test('a line belongs to the invocation that was running when its first part was written', () => {
    const timers = manualTimers()
    let running = 'r1'
    const seen = []
    const split = createLineSplitter({
      timers,
      context: () => running,
      onLine: (line, owner) => seen.push([owner, line]),
    })
    split.push('first part')
    running = 'r2'
    split.push(' and the rest\nnext line\n')
    split.push('written last')
    running = 'r3'
    timers.fireAll()
    expect(seen).toEqual([
      ['r1', 'first part and the rest'],
      ['r2', 'next line'],
      ['r2', 'written last'],
    ])
  })

  test('the rest of a line shown in part after the flush wait keeps the invocation of its first part', () => {
    const timers = manualTimers()
    let running = 'r1'
    const seen = []
    const split = createLineSplitter({
      timers,
      context: () => running,
      onLine: (line, owner) => seen.push([owner, line]),
    })
    split.push('first')
    timers.fireAll()
    running = 'r2'
    split.push('rest\nnext\n')
    expect(seen).toEqual([
      ['r1', 'first'],
      ['r1', 'rest'],
      ['r2', 'next'],
    ])
  })

  test('a long line shown in pieces keeps the invocation of its first part', () => {
    const timers = manualTimers()
    let running = 'r1'
    const seen = []
    const split = createLineSplitter({
      timers,
      limit: 4,
      context: () => running,
      onLine: (line, owner) => seen.push([owner, line]),
    })
    split.push('ab')
    running = 'r2'
    split.push('cdefgh')
    expect(seen).toEqual([
      ['r1', 'abcd'],
      ['r1', 'efgh'],
    ])
    expect(timers.pending.size).toBe(0)
  })
  test('what end shows keeps the invocation of its first part, and so does the rest of its line', () => {
    const timers = manualTimers()
    let running = 'r1'
    const seen = []
    const split = createLineSplitter({
      timers,
      context: () => running,
      onLine: (line, owner) => seen.push([owner, line]),
    })
    split.push('started under r1')
    running = 'r2'
    split.end()
    split.push(' and ended later\nthe next line\n')
    expect(seen).toEqual([
      ['r1', 'started under r1'],
      ['r1', ' and ended later'],
      ['r2', 'the next line'],
    ])
    expect(timers.pending.size).toBe(0)
  })
})
