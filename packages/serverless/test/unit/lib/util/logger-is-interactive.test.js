// Guards the interactivity gate that drives the ora spinner's `isEnabled`. The key regression:
// a pty with no window size reports `columns: 0`, and ora's `ceil(width / columns)` divides by zero
// → Infinity lines to clear → an unbounded clear loop that emits gigabytes. computeIsInteractive
// must treat 0/undefined width as NON-interactive so the spinner never animates there (bounded
// plain-text path, like a pipe). Pure predicate — no spinner, no I/O, no pty.
import { computeIsInteractive } from '@serverless/util/src/logger/index.js'

const tty = (columns) => ({ isTTY: true, columns })

test('a real terminal with a usable width is interactive', () => {
  expect(
    computeIsInteractive({ stdin: { isTTY: true }, stdout: tty(120), env: {} }),
  ).toBe(true)
})

test('columns:0 (winsize-less pty) is NOT interactive — the GB-blowup guard', () => {
  expect(
    computeIsInteractive({ stdin: { isTTY: true }, stdout: tty(0), env: {} }),
  ).toBe(false)
})

test('columns undefined is NOT interactive', () => {
  expect(
    computeIsInteractive({
      stdin: { isTTY: true },
      stdout: { isTTY: true },
      env: {},
    }),
  ).toBe(false)
})

test('a non-TTY pipe is NOT interactive (columns irrelevant)', () => {
  expect(
    computeIsInteractive({
      stdin: { isTTY: false },
      stdout: { isTTY: false },
      env: {},
    }),
  ).toBe(false)
})

test('CI set forces non-interactive even on a good terminal', () => {
  expect(
    computeIsInteractive({
      stdin: { isTTY: true },
      stdout: tty(120),
      env: { CI: 'true' },
    }),
  ).toBe(false)
})

test('SLS_INTERACTIVE_SETUP_ENABLE is an explicit override (no TTY needed)', () => {
  expect(
    computeIsInteractive({
      stdin: { isTTY: false },
      stdout: { isTTY: false },
      env: { SLS_INTERACTIVE_SETUP_ENABLE: '1' },
    }),
  ).toBe(true)
})
