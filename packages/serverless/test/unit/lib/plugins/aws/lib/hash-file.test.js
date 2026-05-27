import { describe, it, expect, beforeAll, afterAll } from '@jest/globals'
import crypto from 'crypto'
import { writeFile, mkdtemp, rm } from 'fs/promises'
import { tmpdir } from 'os'
import path from 'path'
import {
  hashFile,
  hashContent,
} from '../../../../../../lib/plugins/aws/lib/hash-file.js'

/**
 * The helpers in `hash-file.js` exist to centralize the SHA-256/base64
 * incantation the framework uses to identify Lambda code and uploaded
 * artifacts. The format MUST match `crypto.createHash('sha256').update(x)
 * .digest('base64')` exactly — that's the format AWS Lambda reports as
 * `Configuration.CodeSha256` and the framework writes as `filesha256`
 * metadata on uploaded S3 objects. A regression here would silently
 * mis-identify code as "changed" (or worse, "unchanged") in `--diff`.
 *
 * These tests lock the output format and the helpers' equivalence to a
 * directly-inlined call.
 */
describe('hash-file helpers', () => {
  describe('hashContent', () => {
    it('matches a direct crypto.createHash call for a string input', () => {
      const data = 'the quick brown fox jumps over the lazy dog'
      const expected = crypto.createHash('sha256').update(data).digest('base64')
      expect(hashContent(data)).toBe(expected)
    })

    it('matches a direct crypto.createHash call for a Buffer input', () => {
      const data = Buffer.from([0x00, 0xff, 0x42, 0x10, 0x55])
      const expected = crypto.createHash('sha256').update(data).digest('base64')
      expect(hashContent(data)).toBe(expected)
    })

    it('returns a stable, deterministic hash', () => {
      const data = 'reproducibility check'
      expect(hashContent(data)).toBe(hashContent(data))
    })

    it('produces different hashes for different inputs', () => {
      expect(hashContent('a')).not.toBe(hashContent('b'))
    })

    it('produces base64 output (not hex)', () => {
      // SHA-256 in base64 is 44 characters (with a trailing "="), in hex it
      // would be 64 characters. Lock the encoding so a future refactor can't
      // silently switch.
      const hash = hashContent('any value')
      expect(hash).toHaveLength(44)
      expect(hash).toMatch(/^[A-Za-z0-9+/]+=$/)
    })
  })

  describe('hashFile', () => {
    let tmpDir
    let smallFile
    let mediumFile

    beforeAll(async () => {
      tmpDir = await mkdtemp(path.join(tmpdir(), 'sls-hash-file-test-'))
      smallFile = path.join(tmpDir, 'small.bin')
      mediumFile = path.join(tmpDir, 'medium.bin')
      await writeFile(smallFile, 'hello world')
      // ~64 KB to make sure we don't depend on a single-chunk read path.
      await writeFile(mediumFile, Buffer.alloc(64 * 1024, 0xab))
    })

    afterAll(async () => {
      await rm(tmpDir, { recursive: true, force: true })
    })

    it('returns the same hash as crypto.createHash on the file contents', async () => {
      const buf = Buffer.from('hello world')
      const expected = crypto.createHash('sha256').update(buf).digest('base64')
      expect(await hashFile(smallFile)).toBe(expected)
    })

    it('agrees with hashContent on the same file buffer', async () => {
      const buf = Buffer.alloc(64 * 1024, 0xab)
      expect(await hashFile(mediumFile)).toBe(hashContent(buf))
    })

    it('rejects with an error when the file does not exist', async () => {
      await expect(hashFile(path.join(tmpDir, 'missing.bin'))).rejects.toThrow()
    })
  })
})
