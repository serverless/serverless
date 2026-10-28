import { describe, expect, test } from '@jest/globals'
import { terminalWidth } from '../../../../../../../lib/plugins/aws/dev/local/terminal-width.js'

describe('terminalWidth', () => {
  test('is the width of a terminal both output streams are; 0 in a pipe or a log file', () => {
    const tty = { isTTY: true, columns: 120 }
    expect(terminalWidth({ stdout: tty, stderr: tty })).toBe(120)
    expect(terminalWidth({ stdout: { isTTY: false }, stderr: tty })).toBe(0)
    expect(terminalWidth({ stdout: tty, stderr: { isTTY: false } })).toBe(0)
    expect(terminalWidth({ stdout: tty, stderr: { isTTY: true } })).toBe(0)
  })
})
