import { describe, it, expect, afterAll } from '@jest/globals'
import fsp from 'fs/promises'
import os from 'os'
import path from 'path'
import crypto from 'crypto'

const getHashForFilePath = (
  await import('../../../../../../../lib/plugins/aws/package/lib/get-hash-for-file-path.js')
).default

const tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'sls-hash-test-'))

afterAll(async () => {
  await fsp.rm(tmpDir, { recursive: true, force: true })
})

const sha256Base64 = (content) =>
  crypto.createHash('sha256').update(content).digest('base64')

describe('getHashForFilePath', () => {
  it('returns the sha256 base64 hash of the file contents', async () => {
    const filePath = path.join(tmpDir, 'artifact-a.zip')
    await fsp.writeFile(filePath, 'content-a')
    expect(await getHashForFilePath(filePath)).toBe(sha256Base64('content-a'))
  })

  it('returns a fresh hash after the file at the same path is rewritten', async () => {
    // Regression: the memoized hash used to be keyed on path alone, so a
    // rewritten artifact at the same path (repeated in-process deploys)
    // reused the previous deploy's hash — breaking Lambda version publishing.
    const filePath = path.join(tmpDir, 'artifact-b.zip')
    await fsp.writeFile(filePath, 'first-code')
    const firstHash = await getHashForFilePath(filePath)

    // ensure a different mtime even on coarse-grained filesystems
    await new Promise((resolve) => setTimeout(resolve, 20))
    await fsp.writeFile(filePath, 'second-code')

    const secondHash = await getHashForFilePath(filePath)
    expect(secondHash).toBe(sha256Base64('second-code'))
    expect(secondHash).not.toBe(firstHash)
  })

  it('memoizes for an unchanged file (same result, no error)', async () => {
    const filePath = path.join(tmpDir, 'artifact-c.zip')
    await fsp.writeFile(filePath, 'stable-content')
    const first = await getHashForFilePath(filePath)
    const second = await getHashForFilePath(filePath)
    expect(second).toBe(first)
    expect(first).toBe(sha256Base64('stable-content'))
  })
})
