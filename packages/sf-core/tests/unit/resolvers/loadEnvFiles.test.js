import { jest } from '@jest/globals'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { loadEnvFiles } from '../../../src/lib/resolvers/env.js'

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
})
