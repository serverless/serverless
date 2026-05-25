import os from 'node:os'
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { jest } from '@jest/globals'
import { createWatcher } from '../../../../../../../lib/plugins/aws/offline/lib/watcher.js'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Create a fresh temporary directory for each test. */
async function makeTmpDir() {
  const dir = path.join(os.tmpdir(), `watcher-test-${crypto.randomUUID()}`)
  await fs.promises.mkdir(dir, { recursive: true })
  return dir
}

/** Write a file (creating parent dirs as needed). */
async function writeFile(
  filePath,
  content = 'export const handler = () => {}',
) {
  await fs.promises.mkdir(path.dirname(filePath), { recursive: true })
  await fs.promises.writeFile(filePath, content, 'utf8')
}

/** Sleep for ms milliseconds. */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/** Build a minimal serverless-like stub. */
function makeServerless({ functions = {}, hookListeners = [] } = {}) {
  const hooks = {}
  if (hookListeners.length > 0) {
    hooks['offline:functionsUpdated:cleanup'] = hookListeners.map((fn) => ({
      pluginName: 'test',
      hook: fn,
    }))
  }
  return {
    pluginManager: { hooks },
    service: { functions },
  }
}

/** Build a minimal logger stub. */
function makeLogger() {
  return {
    notice: jest.fn(),
    warning: jest.fn(),
    warn: jest.fn(),
  }
}

/** Build a minimal runner stub. */
function makeRunner() {
  return { invalidate: jest.fn() }
}

// Collect controllers created in tests so we can stop them in afterEach.
const controllers = []
afterEach(async () => {
  await Promise.all(controllers.map((c) => c.stop().catch(() => {})))
  controllers.length = 0
})

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('createWatcher', () => {
  // 1. Auto-disable: pluginManager has a listener on offline:functionsUpdated:cleanup
  it('auto-disable: pollingActive is false when bundler plugin has a listener', async () => {
    const tmpDir = await makeTmpDir()
    const serverless = makeServerless({
      functions: {},
      hookListeners: [() => {}],
    })
    const logger = makeLogger()
    const runner = makeRunner()

    const controller = await createWatcher({
      serverless,
      servicePath: tmpDir,
      runner,
      logger,
    })
    controllers.push(controller)

    expect(controller.pollingActive).toBe(false)
    expect(controller.watchedFiles).toEqual(new Set())
  })

  // 2. Auto-enable: no listeners → pollingActive is true
  it('auto-enable: pollingActive is true when no bundler listeners exist', async () => {
    const tmpDir = await makeTmpDir()
    await writeFile(path.join(tmpDir, 'src', 'foo.js'))

    const serverless = makeServerless({
      functions: { foo: { handler: 'src/foo.handler' } },
    })
    const logger = makeLogger()
    const runner = makeRunner()

    const controller = await createWatcher({
      serverless,
      servicePath: tmpDir,
      runner,
      logger,
    })
    controllers.push(controller)

    expect(controller.pollingActive).toBe(true)
  })

  // 3. Single function, single file watched
  it('watchedFiles contains the resolved handler file path', async () => {
    const tmpDir = await makeTmpDir()
    const handlerFile = path.join(tmpDir, 'src', 'foo.js')
    await writeFile(handlerFile)

    const serverless = makeServerless({
      functions: { foo: { handler: 'src/foo.handler' } },
    })
    const logger = makeLogger()
    const runner = makeRunner()

    const controller = await createWatcher({
      serverless,
      servicePath: tmpDir,
      runner,
      logger,
    })
    controllers.push(controller)

    expect(controller.watchedFiles.has(handlerFile)).toBe(true)
    expect(controller.watchedFiles.size).toBe(1)
  })

  // 4. Two functions sharing the same handler file — watched once, both in reverse map
  it('two functions sharing one file: file watched once, both functionKeys invalidated', async () => {
    const tmpDir = await makeTmpDir()
    const handlerFile = path.join(tmpDir, 'src', 'foo.js')
    await writeFile(handlerFile)

    const serverless = makeServerless({
      functions: {
        fooA: { handler: 'src/foo.a' },
        fooB: { handler: 'src/foo.b' },
      },
    })
    const logger = makeLogger()
    const runner = makeRunner()

    const controller = await createWatcher({
      serverless,
      servicePath: tmpDir,
      runner,
      logger,
    })
    controllers.push(controller)

    // Same file, watched once
    expect(controller.watchedFiles.size).toBe(1)
    expect(controller.watchedFiles.has(handlerFile)).toBe(true)

    // Trigger change and wait for debounce
    await writeFile(handlerFile, '// updated')
    await sleep(300)

    expect(runner.invalidate).toHaveBeenCalledWith('fooA')
    expect(runner.invalidate).toHaveBeenCalledWith('fooB')
  })

  // 5. File change triggers invalidate for the matching functionKey
  it('file change triggers runner.invalidate for the watching function', async () => {
    const tmpDir = await makeTmpDir()
    const handlerFile = path.join(tmpDir, 'src', 'foo.js')
    await writeFile(handlerFile)

    const serverless = makeServerless({
      functions: { foo: { handler: 'src/foo.handler' } },
    })
    const logger = makeLogger()
    const runner = makeRunner()

    const controller = await createWatcher({
      serverless,
      servicePath: tmpDir,
      runner,
      logger,
    })
    controllers.push(controller)

    await writeFile(handlerFile, '// changed')
    await sleep(300)

    expect(runner.invalidate).toHaveBeenCalledWith('foo')
  })

  // 6. Two functions sharing one file → both invalidated on change (comprehensive check)
  it('two functions sharing one file are both invalidated on change', async () => {
    const tmpDir = await makeTmpDir()
    const handlerFile = path.join(tmpDir, 'handlers', 'shared.js')
    await writeFile(handlerFile)

    const serverless = makeServerless({
      functions: {
        alpha: { handler: 'handlers/shared.alpha' },
        beta: { handler: 'handlers/shared.beta' },
      },
    })
    const logger = makeLogger()
    const runner = makeRunner()

    const controller = await createWatcher({
      serverless,
      servicePath: tmpDir,
      runner,
      logger,
    })
    controllers.push(controller)

    await writeFile(handlerFile, '// updated shared')
    await sleep(300)

    const calls = runner.invalidate.mock.calls.map((c) => c[0])
    expect(calls).toContain('alpha')
    expect(calls).toContain('beta')
  })

  // 7. Handler file with .mjs extension
  it('resolves handler to .mjs when only that extension exists', async () => {
    const tmpDir = await makeTmpDir()
    const handlerFile = path.join(tmpDir, 'src', 'esm.mjs')
    await writeFile(handlerFile)

    const serverless = makeServerless({
      functions: { esm: { handler: 'src/esm.handler' } },
    })
    const logger = makeLogger()
    const runner = makeRunner()

    const controller = await createWatcher({
      serverless,
      servicePath: tmpDir,
      runner,
      logger,
    })
    controllers.push(controller)

    expect(controller.watchedFiles.has(handlerFile)).toBe(true)
  })

  // 8. Handler file with .ts extension
  it('resolves handler to .ts when only that extension exists', async () => {
    const tmpDir = await makeTmpDir()
    const handlerFile = path.join(tmpDir, 'src', 'typed.ts')
    await writeFile(handlerFile)

    const serverless = makeServerless({
      functions: { typed: { handler: 'src/typed.handler' } },
    })
    const logger = makeLogger()
    const runner = makeRunner()

    const controller = await createWatcher({
      serverless,
      servicePath: tmpDir,
      runner,
      logger,
    })
    controllers.push(controller)

    expect(controller.watchedFiles.has(handlerFile)).toBe(true)
  })

  // 9. Handler file missing: warning logged, function skipped, watcher continues
  it('missing handler file: logs a warning, skips function, other functions still watched', async () => {
    const tmpDir = await makeTmpDir()
    const existingFile = path.join(tmpDir, 'src', 'existing.js')
    await writeFile(existingFile)
    // NOTE: 'missing/handler.js' does NOT exist

    const serverless = makeServerless({
      functions: {
        existing: { handler: 'src/existing.handler' },
        missing: { handler: 'missing/handler.handler' },
      },
    })
    const logger = makeLogger()
    const runner = makeRunner()

    const controller = await createWatcher({
      serverless,
      servicePath: tmpDir,
      runner,
      logger,
    })
    controllers.push(controller)

    // Should not crash; existing function is still watched
    expect(controller.pollingActive).toBe(true)
    expect(controller.watchedFiles.has(existingFile)).toBe(true)
    expect(controller.watchedFiles.size).toBe(1)

    // Warning should have been logged for the missing handler
    expect(logger.warning).toHaveBeenCalled()
  })

  // 10. stop() closes the watcher — changes after stop do NOT call invalidate
  it('stop() closes the watcher; changes after stop do not trigger invalidate', async () => {
    const tmpDir = await makeTmpDir()
    const handlerFile = path.join(tmpDir, 'src', 'stopper.js')
    await writeFile(handlerFile)

    const serverless = makeServerless({
      functions: { stopper: { handler: 'src/stopper.handler' } },
    })
    const logger = makeLogger()
    const runner = makeRunner()

    const controller = await createWatcher({
      serverless,
      servicePath: tmpDir,
      runner,
      logger,
    })
    // Don't add to controllers — we call stop manually
    await controller.stop()

    // Wait for chokidar to settle after stop
    await sleep(100)

    await writeFile(handlerFile, '// after-stop')
    await sleep(300)

    expect(runner.invalidate).not.toHaveBeenCalled()
  })

  // 11. stop() is idempotent — calling twice doesn't throw
  it('stop() is idempotent — calling twice does not throw', async () => {
    const tmpDir = await makeTmpDir()
    await writeFile(path.join(tmpDir, 'fn.js'))

    const serverless = makeServerless({
      functions: { fn: { handler: 'fn.handler' } },
    })
    const logger = makeLogger()
    const runner = makeRunner()

    const controller = await createWatcher({
      serverless,
      servicePath: tmpDir,
      runner,
      logger,
    })

    await expect(controller.stop()).resolves.toBeUndefined()
    await expect(controller.stop()).resolves.toBeUndefined()
  })

  // 11b. stop() on an auto-disabled controller is a no-op
  it('stop() on auto-disabled controller is a no-op', async () => {
    const tmpDir = await makeTmpDir()
    const serverless = makeServerless({
      functions: {},
      hookListeners: [() => {}],
    })
    const logger = makeLogger()
    const runner = makeRunner()

    const controller = await createWatcher({
      serverless,
      servicePath: tmpDir,
      runner,
      logger,
    })

    await expect(controller.stop()).resolves.toBeUndefined()
    await expect(controller.stop()).resolves.toBeUndefined()
  })

  // 12. watchedFiles set reflects what's being watched
  it('watchedFiles accurately reflects the set of watched file paths', async () => {
    const tmpDir = await makeTmpDir()
    const fileA = path.join(tmpDir, 'a.js')
    const fileB = path.join(tmpDir, 'b.cjs')
    await writeFile(fileA)
    await writeFile(fileB)

    const serverless = makeServerless({
      functions: {
        fnA: { handler: 'a.handler' },
        fnB: { handler: 'b.handler' },
      },
    })
    const logger = makeLogger()
    const runner = makeRunner()

    const controller = await createWatcher({
      serverless,
      servicePath: tmpDir,
      runner,
      logger,
    })
    controllers.push(controller)

    expect(controller.watchedFiles).toEqual(new Set([fileA, fileB]))
  })

  // ---------------------------------------------------------------------------
  // enabled: false short-circuits before any chokidar setup
  // ---------------------------------------------------------------------------

  it('enabled:false returns an inert controller without starting chokidar', async () => {
    const tmpDir = await makeTmpDir()
    const serverless = makeServerless({
      functions: { fnA: { handler: 'a.handler' } },
    })
    const logger = makeLogger()
    const runner = makeRunner()

    const controller = await createWatcher({
      serverless,
      servicePath: tmpDir,
      runner,
      logger,
      enabled: false,
    })
    controllers.push(controller)

    expect(controller.pollingActive).toBe(false)
    expect(controller.watchedFiles).toEqual(new Set())
    expect(logger.notice).toHaveBeenCalledWith(
      'Native file watcher disabled — hot reload is turned off',
    )
  })
})
