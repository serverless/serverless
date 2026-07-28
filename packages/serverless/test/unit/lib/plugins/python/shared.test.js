import { describe, it, expect, afterAll } from '@jest/globals'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { sha256Path } from '../../../../../lib/plugins/python/lib/shared.js'

describe('sha256Path', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sha256-path-test-'))

  afterAll(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('returns the lowercase hex SHA-256 digest of the file contents', () => {
    // Digest is embedded in python requirements static-cache directory names,
    // so the format must stay stable across implementations
    const fixturePath = path.join(tmpDir, 'fixture.txt')
    fs.writeFileSync(fixturePath, 'sha256-file replacement fixture\n')

    expect(sha256Path(fixturePath)).toBe(
      'e33168e29578cea2f7531a749b45a86fd70e076718001333f0705712594b4700',
    )
  })

  it('throws for a missing file', () => {
    expect(() => sha256Path(path.join(tmpDir, 'does-not-exist'))).toThrow()
  })
})
