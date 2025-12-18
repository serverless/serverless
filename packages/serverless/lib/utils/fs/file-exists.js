import { promises as fsp } from 'fs'

async function fileExists(filePath) {
  return fsp
    .lstat(filePath)
    .then((stats) => stats.isFile())
    .catch(() => false)
}

export default fileExists
