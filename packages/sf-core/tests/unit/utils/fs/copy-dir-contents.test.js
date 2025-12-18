import { jest } from '@jest/globals'
import fs from 'fs'
import fse from 'fs-extra'
import path from 'path'
import { fileURLToPath } from 'url'
import {
  copyDirContents,
  writeFile,
  fileExists,
} from '../../../../src/utils/fs/index.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

describe('copyDirContents', () => {
  const tmpSrcDirPath = path.join(__dirname, 'testSrc')
  const tmpDestDirPath = path.join(__dirname, 'testDest')

  beforeEach(async () => {
    await fse.ensureDir(tmpSrcDirPath)
    await fse.ensureDir(tmpDestDirPath)
  })

  afterEach(async () => {
    await fse.remove(tmpSrcDirPath)
    await fse.remove(tmpDestDirPath)
  })

  test('should recursively copy directory files including symbolic links', async () => {
    const srcFile1 = path.join(tmpSrcDirPath, 'file1.txt')
    const srcFile2 = path.join(tmpSrcDirPath, 'folder', 'file2.txt')
    const srcFile3 = path.join(tmpSrcDirPath, 'folder', 'file3.txt')

    const destFile1 = path.join(tmpDestDirPath, 'file1.txt')
    const destFile2 = path.join(tmpDestDirPath, 'folder', 'file2.txt')
    const destFile3 = path.join(tmpDestDirPath, 'folder', 'file3.txt')

    await writeFile(srcFile1, 'foo')
    await writeFile(srcFile2, 'bar')

    try {
      fs.symlinkSync(srcFile2, srcFile3)
    } catch (error) {
      if (process.platform === 'win32' && error.code === 'EPERM') {
        // Skip symlink test on Windows if no permission
        return
      }
      throw error
    }

    await copyDirContents(tmpSrcDirPath, tmpDestDirPath)

    expect(await fileExists(destFile1)).toBe(true)
    expect(await fileExists(destFile2)).toBe(true)
    expect(await fileExists(destFile3)).toBe(true)
  })

  test('should recursively copy directory files excluding symbolic links', async () => {
    const srcFile1 = path.join(tmpSrcDirPath, 'file1.txt')
    const srcFile2 = path.join(tmpSrcDirPath, 'folder', 'file2.txt')
    const srcFile3 = path.join(tmpSrcDirPath, 'folder', 'file3.txt')

    const destFile1 = path.join(tmpDestDirPath, 'file1.txt')
    const destFile2 = path.join(tmpDestDirPath, 'folder', 'file2.txt')
    const destFile3 = path.join(tmpDestDirPath, 'folder', 'file3.txt')

    await writeFile(srcFile1, 'foo')
    await writeFile(srcFile2, 'bar')

    try {
      fs.symlinkSync(srcFile2, srcFile3)
    } catch (error) {
      if (process.platform === 'win32' && error.code === 'EPERM') {
        return
      }
      throw error
    }

    await copyDirContents(tmpSrcDirPath, tmpDestDirPath, {
      noLinks: true,
    })

    expect(await fileExists(destFile1)).toBe(true)
    expect(await fileExists(destFile2)).toBe(true)
    expect(await fileExists(destFile3)).toBe(false)
  })
})
