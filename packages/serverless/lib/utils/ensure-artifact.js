import memoizee from 'memoizee'
import crypto from 'crypto'
import fsp from 'fs/promises'
import ensureExists from './ensure-exists.js'
import walkDirSync from './fs/walk-dir-sync.js'
import path from 'path'
import os from 'os'

// Hash of the file names and contents of the directory an artifact is built
// from, so any Framework version (released or run from source) that ships
// different contents gets its own cached artifact
const hashSourceDir = async (sourceDirPath) => {
  const hash = crypto.createHash('sha256')
  const files = walkDirSync(sourceDirPath)
    .map((file) => ({
      file,
      name: path.relative(sourceDirPath, file).split(path.sep).join('/'),
    }))
    .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
  for (const { file, name } of files) {
    const content = await fsp.readFile(file)
    hash.update(`${name}\0${content.length}\0`).update(content)
  }
  return hash.digest('hex')
}

export default memoizee(
  async (filename, sourceDirPath, generate) => {
    const cachePath = path.resolve(
      os.homedir(),
      '.serverless/artifacts',
      await hashSourceDir(sourceDirPath),
    )
    await ensureExists(path.resolve(cachePath, filename), generate)
    return cachePath
  },
  { length: 2, promise: true },
)
