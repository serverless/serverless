import { jest } from '@jest/globals'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { log } from '@serverless/util'
import { loadEnvFiles } from '../../../src/lib/resolvers/env.js'

// Same namespace used by env.js. log.get caches by name, so this resolves
// to the exact same logger instance, which lets us spy on its methods.
const envLogger = log.get('core:resolver:env')

describe('loadEnvFiles (regression tests for current behavior)', () => {
  let originalEnv
  let tmpDir

  beforeEach(() => {
    originalEnv = { ...process.env }
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'load-env-files-'))
  })

  afterEach(() => {
    process.env = originalEnv
    fs.rmSync(tmpDir, { recursive: true, force: true })
    jest.restoreAllMocks()
  })

  // Missing .env and .env.${stage} must be a silent no-op.
  // Locks down the existsSync guards in loadEnvFiles / loadStageEnvFiles.
  describe('missing files', () => {
    it('does not throw when neither .env nor .env.${stage} exist', () => {
      expect(() =>
        loadEnvFiles({ stage: 'dev', configFileDirPath: tmpDir }),
      ).not.toThrow()
    })

    it('does not throw when only .env is missing and no stage is provided', () => {
      expect(() => loadEnvFiles({ configFileDirPath: tmpDir })).not.toThrow()
    })

    it('does not mutate process.env when no env files exist', () => {
      const before = JSON.stringify(process.env)
      loadEnvFiles({ stage: 'dev', configFileDirPath: tmpDir })
      expect(JSON.stringify(process.env)).toBe(before)
    })

    it('does not throw when .env.${stage} is missing but .env exists', () => {
      fs.writeFileSync(path.join(tmpDir, '.env'), 'FOO=from-default\n')
      expect(() =>
        loadEnvFiles({ stage: 'nonexistent-stage', configFileDirPath: tmpDir }),
      ).not.toThrow()
      expect(process.env.FOO).toBe('from-default')
    })
  })

  // Sanity baseline: confirm the function actually loads when files exist.
  // Without this, the missing-file tests above could pass even if the loader
  // were entirely broken (no-op).
  describe('baseline loading behavior', () => {
    it('loads keys from .env into process.env', () => {
      fs.writeFileSync(
        path.join(tmpDir, '.env'),
        'BASELINE_KEY=baseline-value\n',
      )
      delete process.env.BASELINE_KEY
      loadEnvFiles({ configFileDirPath: tmpDir })
      expect(process.env.BASELINE_KEY).toBe('baseline-value')
    })

    it('loads .env.${stage} in addition to .env when stage is provided', () => {
      fs.writeFileSync(path.join(tmpDir, '.env'), 'FROM_DEFAULT=default\n')
      fs.writeFileSync(path.join(tmpDir, '.env.dev'), 'FROM_STAGE=stage\n')
      delete process.env.FROM_DEFAULT
      delete process.env.FROM_STAGE
      loadEnvFiles({ stage: 'dev', configFileDirPath: tmpDir })
      expect(process.env.FROM_DEFAULT).toBe('default')
      expect(process.env.FROM_STAGE).toBe('stage')
    })

    // System process.env values already set must win — dotenv defaults to
    // no-override and the loader does not pass `override: true`.
    it('does not overwrite values already present in process.env', () => {
      fs.writeFileSync(path.join(tmpDir, '.env'), 'SYS_WINS=from-file\n')
      process.env.SYS_WINS = 'from-system'
      loadEnvFiles({ configFileDirPath: tmpDir })
      expect(process.env.SYS_WINS).toBe('from-system')
    })

    // .env.${stage} overrides .env for shared keys, because .env.${stage}
    // is loaded first and dotenv uses first-write-wins.
    it('lets .env.${stage} override .env for shared keys', () => {
      fs.writeFileSync(path.join(tmpDir, '.env'), 'OVERLAP=from-default\n')
      fs.writeFileSync(path.join(tmpDir, '.env.dev'), 'OVERLAP=from-stage\n')
      delete process.env.OVERLAP
      loadEnvFiles({ stage: 'dev', configFileDirPath: tmpDir })
      expect(process.env.OVERLAP).toBe('from-stage')
    })
  })

  // Tests for the custom-path feature added with GitHub issue #10641.
  describe('custom useDotenv paths', () => {
    it('treats useDotenv: true as a no-op for custom loading (locals only)', () => {
      fs.writeFileSync(path.join(tmpDir, '.env'), 'LOCAL_ONLY=from-local\n')
      delete process.env.LOCAL_ONLY
      loadEnvFiles({ configFileDirPath: tmpDir, useDotenv: true })
      expect(process.env.LOCAL_ONLY).toBe('from-local')
    })

    it('silently skips a useDotenv path that does not exist', () => {
      delete process.env.NEVER_SET
      expect(() =>
        loadEnvFiles({
          configFileDirPath: tmpDir,
          useDotenv: './does-not-exist',
        }),
      ).not.toThrow()
      expect(process.env.NEVER_SET).toBeUndefined()
    })

    it('loads .env from a custom directory', () => {
      const customDir = path.join(tmpDir, 'shared')
      fs.mkdirSync(customDir)
      fs.writeFileSync(
        path.join(customDir, '.env'),
        'FROM_SHARED=from-shared\n',
      )
      delete process.env.FROM_SHARED
      loadEnvFiles({ configFileDirPath: tmpDir, useDotenv: './shared' })
      expect(process.env.FROM_SHARED).toBe('from-shared')
    })

    it('loads .env.${stage} alongside .env from a custom directory', () => {
      const customDir = path.join(tmpDir, 'shared')
      fs.mkdirSync(customDir)
      fs.writeFileSync(
        path.join(customDir, '.env'),
        'FROM_DEFAULT=default\nOVERLAP=from-default\n',
      )
      fs.writeFileSync(
        path.join(customDir, '.env.dev'),
        'FROM_STAGE=stage\nOVERLAP=from-stage\n',
      )
      delete process.env.FROM_DEFAULT
      delete process.env.FROM_STAGE
      delete process.env.OVERLAP
      loadEnvFiles({
        stage: 'dev',
        configFileDirPath: tmpDir,
        useDotenv: './shared',
      })
      expect(process.env.FROM_DEFAULT).toBe('default')
      expect(process.env.FROM_STAGE).toBe('stage')
      // Stage file loaded first inside the custom dir, so it wins for shared keys.
      expect(process.env.OVERLAP).toBe('from-stage')
    })

    it('loads exactly the file when useDotenv points to a file path (no stage suffix probing)', () => {
      const customDir = path.join(tmpDir, 'shared')
      fs.mkdirSync(customDir)
      fs.writeFileSync(
        path.join(customDir, '.env.custom'),
        'FILE_KEY=from-file\n',
      )
      fs.writeFileSync(
        path.join(customDir, '.env.custom.dev'),
        'STAGE_KEY=should-not-be-loaded\n',
      )
      delete process.env.FILE_KEY
      delete process.env.STAGE_KEY
      loadEnvFiles({
        stage: 'dev',
        configFileDirPath: tmpDir,
        useDotenv: './shared/.env.custom',
      })
      expect(process.env.FILE_KEY).toBe('from-file')
      expect(process.env.STAGE_KEY).toBeUndefined()
    })

    it('local files beat the custom path for shared keys', () => {
      const customDir = path.join(tmpDir, 'shared')
      fs.mkdirSync(customDir)
      fs.writeFileSync(path.join(tmpDir, '.env'), 'OVERLAP=local\n')
      fs.writeFileSync(path.join(customDir, '.env'), 'OVERLAP=shared\n')
      delete process.env.OVERLAP
      loadEnvFiles({ configFileDirPath: tmpDir, useDotenv: './shared' })
      expect(process.env.OVERLAP).toBe('local')
    })

    it('loads array entries in order — earlier wins for shared keys', () => {
      const specificDir = path.join(tmpDir, 'specific')
      const sharedDir = path.join(tmpDir, 'shared')
      fs.mkdirSync(specificDir)
      fs.mkdirSync(sharedDir)
      fs.writeFileSync(
        path.join(specificDir, '.env'),
        'OVERLAP=from-specific\nONLY_IN_SPECIFIC=specific-only\n',
      )
      fs.writeFileSync(
        path.join(sharedDir, '.env'),
        'OVERLAP=from-shared\nONLY_IN_SHARED=shared-only\n',
      )
      delete process.env.OVERLAP
      delete process.env.ONLY_IN_SPECIFIC
      delete process.env.ONLY_IN_SHARED
      loadEnvFiles({
        configFileDirPath: tmpDir,
        useDotenv: ['./specific', './shared'],
      })
      expect(process.env.OVERLAP).toBe('from-specific')
      expect(process.env.ONLY_IN_SPECIFIC).toBe('specific-only')
      expect(process.env.ONLY_IN_SHARED).toBe('shared-only')
    })

    it('handles mixed file and directory entries in a useDotenv array', () => {
      const sharedDir = path.join(tmpDir, 'shared')
      fs.mkdirSync(sharedDir)
      fs.writeFileSync(
        path.join(tmpDir, 'overrides.env'),
        'KEY_FROM_FILE=file-wins\n',
      )
      fs.writeFileSync(
        path.join(sharedDir, '.env'),
        'KEY_FROM_FILE=shared-loses\nKEY_ONLY_IN_SHARED=shared-only\n',
      )
      delete process.env.KEY_FROM_FILE
      delete process.env.KEY_ONLY_IN_SHARED
      loadEnvFiles({
        configFileDirPath: tmpDir,
        useDotenv: ['./overrides.env', './shared'],
      })
      expect(process.env.KEY_FROM_FILE).toBe('file-wins')
      expect(process.env.KEY_ONLY_IN_SHARED).toBe('shared-only')
    })

    it('keeps process.env winning over custom path values', () => {
      const customDir = path.join(tmpDir, 'shared')
      fs.mkdirSync(customDir)
      fs.writeFileSync(path.join(customDir, '.env'), 'SYS_WINS=from-shared\n')
      process.env.SYS_WINS = 'from-system'
      loadEnvFiles({ configFileDirPath: tmpDir, useDotenv: './shared' })
      expect(process.env.SYS_WINS).toBe('from-system')
    })

    it('does not probe for .env.${stage} when stage is not provided (directory mode)', () => {
      const customDir = path.join(tmpDir, 'shared')
      fs.mkdirSync(customDir)
      fs.writeFileSync(path.join(customDir, '.env'), 'BASE_KEY=base\n')
      fs.writeFileSync(
        path.join(customDir, '.env.dev'),
        'STAGE_KEY=should-not-be-loaded\n',
      )
      delete process.env.BASE_KEY
      delete process.env.STAGE_KEY
      loadEnvFiles({ configFileDirPath: tmpDir, useDotenv: './shared' })
      expect(process.env.BASE_KEY).toBe('base')
      expect(process.env.STAGE_KEY).toBeUndefined()
    })
  })

  // Edge-case behavior for path interpretation and file-content quirks.
  // configFileDirPath is the resolution anchor for relative paths only;
  // absolute paths and ../-escaping paths are passed straight through to
  // path.resolve(), with no security boundary.
  describe('path interpretation and file content edge cases', () => {
    it('accepts an absolute path and loads from it', () => {
      const absDir = fs.mkdtempSync(path.join(os.tmpdir(), 'load-env-abs-'))
      try {
        fs.writeFileSync(path.join(absDir, '.env'), 'FROM_ABS_PATH=abs-value\n')
        delete process.env.FROM_ABS_PATH
        loadEnvFiles({ configFileDirPath: tmpDir, useDotenv: absDir })
        expect(process.env.FROM_ABS_PATH).toBe('abs-value')
      } finally {
        fs.rmSync(absDir, { recursive: true, force: true })
      }
    })

    it('accepts an absolute file path and loads exactly that file', () => {
      const absDir = fs.mkdtempSync(path.join(os.tmpdir(), 'load-env-abs-'))
      try {
        const absFile = path.join(absDir, 'shared.env')
        fs.writeFileSync(absFile, 'FROM_ABS_FILE=abs-file-value\n')
        delete process.env.FROM_ABS_FILE
        loadEnvFiles({ configFileDirPath: tmpDir, useDotenv: absFile })
        expect(process.env.FROM_ABS_FILE).toBe('abs-file-value')
      } finally {
        fs.rmSync(absDir, { recursive: true, force: true })
      }
    })

    it('allows paths that escape configFileDirPath via .. (no sandbox)', () => {
      // The custom path is resolved with path.resolve and there is no check
      // that the result is contained within configFileDirPath. This is by
      // design — users opt in to useDotenv explicitly, and the monorepo use
      // case requires traversing up to a shared parent directory.
      const parent = path.dirname(tmpDir)
      const sibling = fs.mkdtempSync(path.join(parent, 'load-env-sibling-'))
      try {
        fs.writeFileSync(
          path.join(sibling, '.env'),
          'FROM_SIBLING=sibling-value\n',
        )
        const relativeEscape = path.join('..', path.basename(sibling))
        delete process.env.FROM_SIBLING
        loadEnvFiles({
          configFileDirPath: tmpDir,
          useDotenv: relativeEscape,
        })
        expect(process.env.FROM_SIBLING).toBe('sibling-value')
      } finally {
        fs.rmSync(sibling, { recursive: true, force: true })
      }
    })

    it('ignores garbage lines in a .env file and loads what it can parse', () => {
      // dotenv is tolerant: lines that do not match KEY=value (or are
      // pure garbage) are silently skipped. Valid KEY=value lines around
      // the garbage still load.
      fs.writeFileSync(
        path.join(tmpDir, '.env'),
        'GOOD_KEY=good\n!!!this is not valid!!!\nrandom text without equals\nANOTHER_GOOD=also-good\n',
      )
      delete process.env.GOOD_KEY
      delete process.env.ANOTHER_GOOD
      expect(() => loadEnvFiles({ configFileDirPath: tmpDir })).not.toThrow()
      expect(process.env.GOOD_KEY).toBe('good')
      expect(process.env.ANOTHER_GOOD).toBe('also-good')
    })

    it('treats a comments-only .env as a no-op', () => {
      fs.writeFileSync(
        path.join(tmpDir, '.env'),
        '# this file has only comments\n# and blank lines\n\n',
      )
      const before = JSON.stringify(process.env)
      expect(() => loadEnvFiles({ configFileDirPath: tmpDir })).not.toThrow()
      expect(JSON.stringify(process.env)).toBe(before)
    })

    it('treats an empty .env as a no-op', () => {
      fs.writeFileSync(path.join(tmpDir, '.env'), '')
      const before = JSON.stringify(process.env)
      expect(() => loadEnvFiles({ configFileDirPath: tmpDir })).not.toThrow()
      expect(JSON.stringify(process.env)).toBe(before)
    })
  })

  // Verifies the debug/warning logging added so users running with
  // SLS_DEBUG=* (or equivalent) can see which env files were loaded
  // and which keys were set, plus surface dotenv errors that would
  // otherwise be silent.
  describe('debug logging', () => {
    let debugSpy
    let warningSpy

    beforeEach(() => {
      debugSpy = jest.spyOn(envLogger, 'debug').mockImplementation(() => {})
      warningSpy = jest.spyOn(envLogger, 'warning').mockImplementation(() => {})
    })

    it('logs a debug message with file path and key names on successful load', () => {
      fs.writeFileSync(path.join(tmpDir, '.env'), 'A=1\nB=2\n')
      delete process.env.A
      delete process.env.B
      loadEnvFiles({ configFileDirPath: tmpDir })
      expect(debugSpy).toHaveBeenCalledTimes(1)
      const message = debugSpy.mock.calls[0][0]
      expect(message).toContain(path.join(tmpDir, '.env'))
      expect(message).toContain('A')
      expect(message).toContain('B')
    })

    it('does not log key values, only key names', () => {
      fs.writeFileSync(
        path.join(tmpDir, '.env'),
        'SECRET=do-not-leak-this-value\n',
      )
      delete process.env.SECRET
      loadEnvFiles({ configFileDirPath: tmpDir })
      for (const call of debugSpy.mock.calls) {
        expect(call[0]).not.toContain('do-not-leak-this-value')
      }
    })

    it('logs once per file when both local files are present', () => {
      fs.writeFileSync(path.join(tmpDir, '.env'), 'A=1\n')
      fs.writeFileSync(path.join(tmpDir, '.env.dev'), 'B=2\n')
      delete process.env.A
      delete process.env.B
      loadEnvFiles({ stage: 'dev', configFileDirPath: tmpDir })
      expect(debugSpy).toHaveBeenCalledTimes(2)
    })

    it('logs once per loaded file when both local and custom paths exist', () => {
      fs.writeFileSync(path.join(tmpDir, '.env'), 'LOCAL=1\n')
      const sharedDir = path.join(tmpDir, 'shared')
      fs.mkdirSync(sharedDir)
      fs.writeFileSync(path.join(sharedDir, '.env'), 'SHARED=2\n')
      delete process.env.LOCAL
      delete process.env.SHARED
      loadEnvFiles({ configFileDirPath: tmpDir, useDotenv: './shared' })
      expect(debugSpy).toHaveBeenCalledTimes(2)
    })

    it('does not log for a missing file', () => {
      loadEnvFiles({ configFileDirPath: tmpDir })
      expect(debugSpy).not.toHaveBeenCalled()
      expect(warningSpy).not.toHaveBeenCalled()
    })

    it('logs a debug message (no warning) for a file with no parseable keys', () => {
      fs.writeFileSync(path.join(tmpDir, '.env'), '# only a comment\n')
      loadEnvFiles({ configFileDirPath: tmpDir })
      expect(warningSpy).not.toHaveBeenCalled()
      expect(debugSpy).toHaveBeenCalledTimes(1)
      expect(debugSpy.mock.calls[0][0]).toContain('no keys parsed')
    })

    it('logs at debug level (not warning) when dotenv.config returns an error', async () => {
      // Force dotenv.config to return an error by mocking it. Done via
      // jest.unstable_mockModule + dynamic re-import so the test stays
      // isolated from the other tests in this file (which use the real
      // dotenv). Verifies the loader stays quiet by default even when
      // dotenv reports a failure — matching the rest of the loader's
      // tolerant, silently-skip personality.
      jest.resetModules()
      const dotenvErrorMessage = 'simulated permission denied'
      jest.unstable_mockModule('dotenv', () => ({
        default: {
          config: jest.fn(() => ({
            error: new Error(dotenvErrorMessage),
          })),
        },
      }))
      // After resetModules, @serverless/util gets re-imported with its own
      // fresh logger registry. Spy on THAT registry's logger (the same one
      // the freshly-imported env.js will capture), not the top-of-file
      // `log` reference (which now points at a stale registry).
      const { log: isolatedLog } = await import('@serverless/util')
      const isolatedLogger = isolatedLog.get('core:resolver:env')
      const isolatedDebugSpy = jest
        .spyOn(isolatedLogger, 'debug')
        .mockImplementation(() => {})
      const isolatedWarningSpy = jest
        .spyOn(isolatedLogger, 'warning')
        .mockImplementation(() => {})
      const { loadEnvFiles: loadEnvFilesIsolated } =
        await import('../../../src/lib/resolvers/env.js')

      fs.writeFileSync(path.join(tmpDir, '.env'), 'A=1\n')
      loadEnvFilesIsolated({ configFileDirPath: tmpDir })

      expect(isolatedWarningSpy).not.toHaveBeenCalled()
      expect(isolatedDebugSpy).toHaveBeenCalledTimes(1)
      const message = isolatedDebugSpy.mock.calls[0][0]
      expect(message).toContain(path.join(tmpDir, '.env'))
      expect(message).toContain(dotenvErrorMessage)

      // Restore for subsequent tests in this file.
      jest.resetModules()
    })

    it('does not throw when statSync fails after existsSync passes', async () => {
      // Simulates a TOCTOU race / permission glitch: existsSync says yes,
      // but statSync throws when we try to check the file type. Without
      // the guard around statSync in loadCustomEnvFiles, the whole
      // resolver pipeline would crash. Verifies the silent-skip contract
      // holds for this failure mode too.
      jest.resetModules()
      const statErrorMessage = 'simulated permission denied on stat'
      // Spread the real fs so transitive consumers (e.g. anything in
      // @serverless/util that does `import fs from 'fs'`) keep working;
      // only override existsSync and statSync for the loader under test.
      const realFs = await import('node:fs')
      const fsMock = {
        ...realFs,
        existsSync: jest.fn(() => true),
        statSync: jest.fn(() => {
          throw new Error(statErrorMessage)
        }),
      }
      jest.unstable_mockModule('node:fs', () => ({
        ...fsMock,
        default: fsMock,
      }))
      const { log: isolatedLog } = await import('@serverless/util')
      const isolatedLogger = isolatedLog.get('core:resolver:env')
      const isolatedDebugSpy = jest
        .spyOn(isolatedLogger, 'debug')
        .mockImplementation(() => {})
      const isolatedWarningSpy = jest
        .spyOn(isolatedLogger, 'warning')
        .mockImplementation(() => {})
      const { loadEnvFiles: loadEnvFilesIsolated } =
        await import('../../../src/lib/resolvers/env.js')

      expect(() =>
        loadEnvFilesIsolated({
          configFileDirPath: tmpDir,
          useDotenv: './shared',
        }),
      ).not.toThrow()
      expect(isolatedWarningSpy).not.toHaveBeenCalled()
      // The debug breadcrumb names the path and surfaces the underlying
      // error message so users running with debug logging can see why
      // a custom path was skipped.
      const skipCall = isolatedDebugSpy.mock.calls.find((call) =>
        call[0].includes(statErrorMessage),
      )
      expect(skipCall).toBeDefined()
      expect(skipCall[0]).toContain(path.join(tmpDir, 'shared'))

      // Restore for subsequent tests in this file.
      jest.resetModules()
    })
  })
})
