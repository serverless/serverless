import { spawnSync } from 'child_process'
import path from 'path'
import { fileURLToPath, pathToFileURL } from 'url'

const moduleUrl = pathToFileURL(
  path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '../../../../src/utils/cli/fail-on-stall.js',
  ),
).href

// Runs a command promise under failOnStall in a separate Node.js process,
// where the event loop really runs out of work.
const runWithGuard = (commandPromise, afterGuard = '') =>
  spawnSync(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      `import { failOnStall } from ${JSON.stringify(moduleUrl)}
       failOnStall(${commandPromise}, () => {
         console.log('stalled')
         process.exitCode = 1
       })
       ${afterGuard}`,
    ],
    { encoding: 'utf8', timeout: 10_000 },
  )

describe('failOnStall', () => {
  it('reports a command that never settles before the process exits', () => {
    const { status, stdout } = runWithGuard('new Promise(() => {})')
    expect(stdout.trim()).toBe('stalled')
    expect(status).toBe(1)
  })

  it('stays silent for a command that settles', () => {
    const { status, stdout } = runWithGuard(
      'new Promise((resolve) => setTimeout(resolve, 50))',
    )
    expect(stdout).toBe('')
    expect(status).toBe(0)
  })

  it('stays silent for a command that rejects', () => {
    const { status, stdout, stderr } = runWithGuard(
      'Promise.reject(new Error("failed"))',
    )
    expect(stdout).toBe('')
    expect(stderr).toBe('')
    expect(status).toBe(0)
  })

  it('stays silent when a later beforeExit listener settles the command', () => {
    const { status, stdout } = runWithGuard(
      'new Promise((resolve) => { globalThis.settleCommand = resolve })',
      `process.once('beforeExit', () =>
         setTimeout(() => globalThis.settleCommand(), 50))`,
    )
    expect(stdout).toBe('')
    expect(status).toBe(0)
  })

  it('stays silent when the command ends the process itself', () => {
    const { status, stdout } = runWithGuard(
      'new Promise(() => {})',
      'setTimeout(() => process.exit(0), 50)',
    )
    expect(stdout).toBe('')
    expect(status).toBe(0)
  })
})
