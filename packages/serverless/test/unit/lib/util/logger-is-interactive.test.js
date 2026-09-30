// Guards the interactivity gate that drives the ora spinner's `isEnabled`. The key regression:
// a pty with no window size reports `columns: 0`, and ora's `ceil(width / columns)` divides by zero
// → Infinity lines to clear → an unbounded clear loop that emits gigabytes. computeIsInteractive
// must treat a zero-width TTY as NON-interactive on EVERY path — including the
// SLS_INTERACTIVE_SETUP_ENABLE override, which previously bypassed the width guard and re-created
// the flood on CircleCI's zero-width pty (GitHub issue #13786). Non-TTY streams are not vetoed:
// the override keeps working for scripted (piped) setups, and ora skips its clear-line path on
// non-TTY streams, so no flood is possible there. Every case passes stdin/stdout/stderr explicitly
// so results never depend on the terminal the test runner happens to be attached to. Pure
// predicate — no spinner, no I/O, no pty.
import { computeIsInteractive } from '@serverless/util/src/logger/index.js'

const tty = (columns) => ({ isTTY: true, columns })
const pipe = () => ({ isTTY: false })

test('a real terminal with a usable width is interactive', () => {
  expect(
    computeIsInteractive({
      stdin: tty(120),
      stdout: tty(120),
      stderr: tty(120),
      env: {},
    }),
  ).toBe(true)
})

test('columns:0 (winsize-less pty) is NOT interactive — the GB-blowup guard', () => {
  expect(
    computeIsInteractive({
      stdin: tty(0),
      stdout: tty(0),
      stderr: tty(0),
      env: {},
    }),
  ).toBe(false)
})

test('columns undefined is NOT interactive', () => {
  expect(
    computeIsInteractive({
      stdin: { isTTY: true },
      stdout: { isTTY: true },
      stderr: { isTTY: true },
      env: {},
    }),
  ).toBe(false)
})

test('a non-TTY pipe is NOT interactive (columns irrelevant)', () => {
  expect(
    computeIsInteractive({
      stdin: pipe(),
      stdout: pipe(),
      stderr: pipe(),
      env: {},
    }),
  ).toBe(false)
})

test('CI set forces non-interactive even on a good terminal', () => {
  expect(
    computeIsInteractive({
      stdin: tty(120),
      stdout: tty(120),
      stderr: tty(120),
      env: { CI: 'true' },
    }),
  ).toBe(false)
})

test('a zero-width stderr TTY is NOT interactive even when stdout is usable — the spinner renders on stderr', () => {
  expect(
    computeIsInteractive({
      stdin: tty(120),
      stdout: tty(120),
      stderr: tty(0),
      env: {},
    }),
  ).toBe(false)
})

test('a non-TTY stderr does not block interactivity (ora skips clear-line on pipes)', () => {
  expect(
    computeIsInteractive({
      stdin: tty(120),
      stdout: tty(120),
      stderr: pipe(),
      env: {},
    }),
  ).toBe(true)
})

test('SLS_INTERACTIVE_SETUP_ENABLE overrides the CI check on a usable terminal', () => {
  expect(
    computeIsInteractive({
      stdin: tty(120),
      stdout: tty(120),
      stderr: tty(120),
      env: { CI: 'true', SLS_INTERACTIVE_SETUP_ENABLE: '1' },
    }),
  ).toBe(true)
})

test('SLS_INTERACTIVE_SETUP_ENABLE keeps working for scripted non-TTY (piped) setups', () => {
  expect(
    computeIsInteractive({
      stdin: pipe(),
      stdout: pipe(),
      stderr: pipe(),
      env: { CI: 'true', SLS_INTERACTIVE_SETUP_ENABLE: '1' },
    }),
  ).toBe(true)
})

test('override + zero-width stdout pty is NOT interactive — the #13786 flood guard', () => {
  expect(
    computeIsInteractive({
      stdin: tty(0),
      stdout: tty(0),
      stderr: tty(0),
      env: { CI: 'true', SLS_INTERACTIVE_SETUP_ENABLE: '1' },
    }),
  ).toBe(false)
})

test('override + zero-width stderr pty is NOT interactive even when stdout is usable', () => {
  expect(
    computeIsInteractive({
      stdin: tty(120),
      stdout: tty(120),
      stderr: tty(0),
      env: { SLS_INTERACTIVE_SETUP_ENABLE: '1' },
    }),
  ).toBe(false)
})

test('override + stderr TTY with undefined columns is NOT interactive even when stdin/stdout are usable', () => {
  expect(
    computeIsInteractive({
      stdin: tty(120),
      stdout: tty(120),
      stderr: { isTTY: true },
      env: { SLS_INTERACTIVE_SETUP_ENABLE: '1' },
    }),
  ).toBe(false)
})

test('override + TTY with undefined columns is NOT interactive', () => {
  expect(
    computeIsInteractive({
      stdin: { isTTY: true },
      stdout: { isTTY: true },
      stderr: { isTTY: true },
      env: { SLS_INTERACTIVE_SETUP_ENABLE: '1' },
    }),
  ).toBe(false)
})

// AI coding agents: detection only ever switches interactivity OFF. The zero-width veto and the
// SLS_INTERACTIVE_SETUP_ENABLE override keep their precedence over it.
test('an agent on a real terminal is NOT interactive', () => {
  expect(
    computeIsInteractive({
      stdin: tty(120),
      stdout: tty(120),
      stderr: tty(120),
      env: {},
      isAgent: true,
    }),
  ).toBe(false)
})

test('the override still forces interactive for an agent (escape hatch for a wrong detection)', () => {
  expect(
    computeIsInteractive({
      stdin: tty(120),
      stdout: tty(120),
      stderr: tty(120),
      env: { SLS_INTERACTIVE_SETUP_ENABLE: '1' },
      isAgent: true,
    }),
  ).toBe(true)
})

test('zero-width veto beats the override even for an agent', () => {
  expect(
    computeIsInteractive({
      stdin: tty(0),
      stdout: tty(0),
      stderr: tty(0),
      env: { SLS_INTERACTIVE_SETUP_ENABLE: '1' },
      isAgent: true,
    }),
  ).toBe(false)
})

test('an agent on pipes stays non-interactive', () => {
  expect(
    computeIsInteractive({
      stdin: pipe(),
      stdout: pipe(),
      stderr: pipe(),
      env: {},
      isAgent: true,
    }),
  ).toBe(false)
})

test('isAgent defaults to false — a real terminal without it is interactive (no change for humans)', () => {
  expect(
    computeIsInteractive({
      stdin: tty(120),
      stdout: tty(120),
      stderr: tty(120),
      env: {},
    }),
  ).toBe(true)
})

// Hardening: no argument, null or a non-object env never throws; the process environment is used.
test('a missing or null options object reads the process streams and environment', () => {
  expect(() => computeIsInteractive(null)).not.toThrow()
  expect(computeIsInteractive(null)).toBe(computeIsInteractive())
})

test.each([[null], [undefined], ['CI=true'], [42]])(
  'env %p falls back to the process environment',
  (env) => {
    const streams = { stdin: tty(120), stdout: tty(120), stderr: tty(120) }
    expect(() => computeIsInteractive({ ...streams, env })).not.toThrow()
    expect(computeIsInteractive({ ...streams, env })).toBe(
      computeIsInteractive({ ...streams, env: process.env }),
    )
  },
)
