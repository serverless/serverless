import os from 'os'
import crypto from 'crypto'
import fs from 'fs'
import path from 'path'
import fse from 'fs-extra'
import fileExistsSync from '../utils/fs/file-exists-sync.js'
import writeFileSync from '../utils/fs/write-file-sync.js'
import copyDirContentsSync from '../utils/fs/copy-dir-contents-sync.js'
import readFileSync from '../utils/fs/read-file-sync.js'
import readFile from '../utils/fs/read-file.js'
import walkDirSync from '../utils/fs/walk-dir-sync.js'
import dirExistsSync from '../utils/fs/dir-exists-sync.js'

class Utils {
  constructor(serverless) {
    this.serverless = serverless
  }

  getVersion() {
    return this.serverless.version
  }

  dirExistsSync(dirPath) {
    return dirExistsSync(dirPath)
  }

  getTmpDirPath() {
    const dirPath = path.join(
      os.tmpdir(),
      'tmpdirs-serverless',
      crypto.randomBytes(8).toString('hex'),
    )
    fse.ensureDirSync(dirPath)
    return dirPath
  }

  fileExistsSync(filePath) {
    return fileExistsSync(filePath)
  }

  writeFileDir(filePath) {
    fse.mkdirsSync(path.dirname(filePath))
  }

  writeFileSync(filePath, contents, cycles) {
    writeFileSync(filePath, contents, cycles)
  }

  async writeFile(filePath, contents, cycles) {
    return new Promise((resolve, reject) => {
      try {
        this.writeFileSync(filePath, contents, cycles)
      } catch (e) {
        reject(e)
      }
      resolve()
    })
  }

  async appendFileSync(filePath, conts) {
    const contents = conts || ''

    return new Promise((resolve, reject) => {
      try {
        fs.appendFileSync(filePath, contents)
      } catch (e) {
        reject(e)
      }
      resolve()
    })
  }

  readFileSync(filePath) {
    return readFileSync(filePath)
  }

  readFile(filePath) {
    return readFile(filePath)
  }

  walkDirSync(dirPath) {
    return walkDirSync(dirPath)
  }

  copyDirContentsSync(srcDir, destDir) {
    return copyDirContentsSync(srcDir, destDir)
  }

  generateShortId(length) {
    return Math.random().toString(36).substr(2, length)
  }

  isEventUsed(functions, eventName) {
    return Object.keys(functions).reduce((accum, key) => {
      const events = functions[key].events || []
      if (events.length) {
        events.forEach((event) => {
          if (Object.keys(event)[0] === eventName) {
            accum = true
          }
        })
      }
      return accum
    }, false)
  }
}

export default Utils
