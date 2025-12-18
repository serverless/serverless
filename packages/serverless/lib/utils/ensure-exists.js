import fse from 'fs-extra'
import fsp from 'fs/promises'
import path from 'path'

export default async (filename, generate) => {
  const cacheDir = path.dirname(filename)
  try {
    const stats = await fsp.lstat(filename)
    if (stats.isFile()) {
      return
    }
  } catch (err) {
    if (err.code !== 'ENOENT') throw err
  }

  await fse.ensureDir(cacheDir)
  await generate(cacheDir)
}
