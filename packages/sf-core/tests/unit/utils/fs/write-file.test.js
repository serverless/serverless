import { jest } from '@jest/globals'
import fs from 'fs-extra'
import path from 'path'
import { fileURLToPath } from 'url'
import { writeFile, readFile } from '../../../../src/utils/fs/index.js'
import yaml from 'js-yaml'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const tmpDir = path.join(__dirname, 'tmp-write-file')

describe('writeFile', () => {
  beforeEach(async () => {
    await fs.ensureDir(tmpDir)
  })

  afterEach(async () => {
    await fs.remove(tmpDir)
  })

  it('should write a .json file asynchronously with serialization', async () => {
    const tmpFilePath = path.join(tmpDir, 'anything.json')
    await writeFile(tmpFilePath, { foo: 'bar' })

    const content = await fs.readFile(tmpFilePath, 'utf8')
    expect(JSON.parse(content)).toEqual({ foo: 'bar' })
  })

  it('should write a .yml file asynchronously with serialization', async () => {
    const tmpFilePath = path.join(tmpDir, 'anything.yml')
    await writeFile(tmpFilePath, { foo: 'bar' })

    const content = await fs.readFile(tmpFilePath, 'utf8')
    expect(yaml.load(content)).toEqual({ foo: 'bar' })
  })

  it('should write a .yaml file asynchronously with serialization', async () => {
    const tmpFilePath = path.join(tmpDir, 'anything.yaml')
    await writeFile(tmpFilePath, { foo: 'bar' })

    const content = await fs.readFile(tmpFilePath, 'utf8')
    expect(yaml.load(content)).toEqual({ foo: 'bar' })
  })
})
