import path from 'path'
import fsp from 'fs/promises'
import { fileURLToPath } from 'url'
import { log } from '@serverless/util'

let __dirname = path.dirname(fileURLToPath(import.meta.url))
if (__dirname.endsWith('dist')) {
  __dirname = path.join(__dirname, '../../serverless/lib/utils/npm-package')
}
const npmPackageRoot = path.resolve(__dirname, '../../../')

export default async () => {
  const stats = await fsp.stat(npmPackageRoot)
  try {
    await fsp.utimes(
      npmPackageRoot,
      String(stats.atimeMs / 1000),
      String(stats.mtimeMs / 1000),
    )
    return true
  } catch (error) {
    log.info('Auto update: file access error: %O', error)
    return false
  }
}
