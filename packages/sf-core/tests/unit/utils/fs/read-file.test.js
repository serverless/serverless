import { jest } from '@jest/globals'
import fs from 'fs-extra'
import path from 'path'
import { fileURLToPath } from 'url'
import { readFile, writeFile } from '../../../../src/utils/fs/index.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const tmpDir = path.join(__dirname, 'tmp-read-file')

describe('readFile', () => {
  beforeEach(async () => {
    await fs.ensureDir(tmpDir)
  })

  afterEach(async () => {
    await fs.remove(tmpDir)
  })

  it('should read a file asynchronously as string', async () => {
    const tmpFilePath = path.join(tmpDir, 'anything.json')
    await fs.writeFile(tmpFilePath, JSON.stringify({ foo: 'bar' }))
    expect(await readFile(tmpFilePath)).toBe(JSON.stringify({ foo: 'bar' }))
  })

  it('should read a filename extension .yml as string', async () => {
    const tmpFilePath = path.join(tmpDir, 'anything.yml')
    await fs.writeFile(tmpFilePath, 'foo: bar')
    expect(await readFile(tmpFilePath)).toBe('foo: bar')
  })

  it('should read a filename extension .yaml as string', async () => {
    const tmpFilePath = path.join(tmpDir, 'anything.yaml')
    await fs.writeFile(tmpFilePath, 'foo: bar')
    expect(await readFile(tmpFilePath)).toBe('foo: bar')
  })
})
