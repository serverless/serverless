import { jest } from '@jest/globals'
import path from 'path'
import { fileURLToPath } from 'url'
import { fileExists } from '../../../../src/utils/fs/index.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

describe('fileExists', () => {
  it('should detect if a file exists', async () => {
    expect(await fileExists(__filename)).toBe(true)
  })

  it("should detect if a file doesn't exist", async () => {
    expect(await fileExists(path.join(__dirname, 'XYZ.json'))).toBe(false)
  })
})
