import path from 'path'
import fsp from 'fs/promises'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const localNpmBinPath = path.join(
  __dirname,
  '../../node_modules/npm/bin/npm-cli.js',
)

export default fsp
  .stat(localNpmBinPath)
  .then(
    (stats) => stats.isFile(),
    (error) => {
      if (error.code === 'ENOENT') return null
      throw error
    },
  )
  .then((isNpmInstalledLocaly) => {
    return isNpmInstalledLocaly
      ? { command: 'node', args: [localNpmBinPath] }
      : { command: 'npm', args: [] }
  })
