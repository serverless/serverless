// Guards the plain (non-animated) progress path. When the spinner cannot render
// (non-TTY streams — always the case under jest — or a zero-width TTY), progress
// updates are written as plain stderr lines at the 'info' level. That level is
// deliberate for compose messages too: Compose's aggregated progress line (re-
// noticed with a shrinking service list) only makes sense morphing in place
// inside the spinner — on the plain path it stays filtered (both at the
// 'compose' level and in error-only runs), and non-animated compose runs report
// per-service completion lines via writeCompose instead.
import {
  progress,
  setGlobalRendererSettings,
  getGlobalRendererSettings,
} from '@serverless/util/src/logger/index.js'

// Pin the renderer to non-interactive: when jest runs in-band from a real
// terminal, the module-load detection sees genuine TTYs and the animated path
// would engage instead — failing the synchronous assertions and leaving a live
// ora interval behind. Restored after the suite.
let originalIsInteractive
beforeAll(() => {
  originalIsInteractive = getGlobalRendererSettings().isInteractive
  setGlobalRendererSettings({ isInteractive: false })
})
afterAll(() => {
  setGlobalRendererSettings({ isInteractive: originalIsInteractive })
})

const captureStdErr = (fn) => {
  const written = []
  const original = process.stderr.write
  process.stderr.write = (chunk) => {
    written.push(String(chunk))
    return true
  }
  try {
    fn()
  } finally {
    process.stderr.write = original
  }
  return written.join('')
}

const withLogLevel = (logLevel, fn) => {
  const { logLevel: previous } = getGlobalRendererSettings()
  setGlobalRendererSettings({ logLevel })
  try {
    return fn()
  } finally {
    setGlobalRendererSettings({ logLevel: previous })
  }
}

test('compose progress messages stay off the plain path at the compose log level', () => {
  const output = withLogLevel('compose', () =>
    captureStdErr(() =>
      progress
        .get('plain-path-compose')
        .notice('Deploying services', { isComposeMessage: true }),
    ),
  )
  expect(output).not.toContain('Deploying services')
})

test('compose progress messages stay silent in error-only runs', () => {
  const output = withLogLevel('error', () =>
    captureStdErr(() =>
      progress
        .get('plain-path-compose-error')
        .notice('Deploying services', { isComposeMessage: true }),
    ),
  )
  expect(output).not.toContain('Deploying services')
})

test('regular progress messages print at the info level on the plain path', () => {
  const output = withLogLevel('info', () =>
    captureStdErr(() => progress.get('plain-path-info').notice('Packaging')),
  )
  expect(output).toContain('Packaging')
})

test('regular progress messages stay hidden at the default notice level', () => {
  const output = withLogLevel('notice', () =>
    captureStdErr(() => progress.get('plain-path-notice').notice('Packaging')),
  )
  expect(output).not.toContain('Packaging')
})
