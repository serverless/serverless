import { promises as fsp } from 'fs'

async function dirExists(path) {
  return fsp.lstat(path).then(
    (stats) => stats.isDirectory(),
    (error) => {
      if (error.code === 'ENOENT') {
        return false
      }
      throw error
    },
  )
}

export default dirExists
