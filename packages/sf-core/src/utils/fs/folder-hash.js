import fs from 'node:fs/promises'
import path from 'node:path'
import crypto from 'node:crypto'

export const hashFolder = async (folderPath) => {
  const hashContent = async (filePath) => {
    const stats = await fs.stat(filePath)
    const content = `${path.basename(filePath)}|${stats.size}|${stats.mtime.toISOString()}`
    return crypto.createHash('md5').update(content).digest('hex')
  }

  const traverseFolder = async (dir) => {
    const files = await fs.readdir(dir)
    const hashes = []

    for (const file of files) {
      const filePath = path.join(dir, file)
      const stats = await fs.stat(filePath)

      if (
        filePath.includes('node_modules') ||
        filePath.includes('.serverless')
      ) {
        continue
      }
      if (stats.isDirectory()) {
        hashes.push(...(await traverseFolder(filePath)))
      } else {
        hashes.push(await hashContent(filePath))
      }
    }

    return hashes
  }

  const hashes = await traverseFolder(folderPath)
  const folderHash = crypto
    .createHash('md5')
    .update(hashes.sort().join(''))
    .digest('hex')

  return folderHash
}
