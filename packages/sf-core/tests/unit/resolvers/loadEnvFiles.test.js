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
})
