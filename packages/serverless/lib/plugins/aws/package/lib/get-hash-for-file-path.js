import memoize from 'memoizee'
import crypto from 'crypto'
import fs from 'fs'
import fsp from 'fs/promises'

const hashFileContents = memoize(
  // cacheKey embeds the file's mtime and size so a rewritten artifact at the
  // same path (e.g. repeated in-process deploys) never reuses a stale hash.
  async (cacheKey, filePath) => {
    const fileHash = crypto.createHash('sha256')
    fileHash.setEncoding('base64')
    return new Promise((resolve, reject) => {
      const readStream = fs.createReadStream(filePath)
      readStream
        .on('data', (chunk) => {
          fileHash.write(chunk)
        })
        .on('close', () => {
          fileHash.end()
          resolve(fileHash.read())
        })
        .on('error', (error) => {
          reject(
            new Error(
              `Error: ${error} encountered during hash calculation for provided filePath: ${filePath}`,
            ),
          )
        })
    })
  },
  { promise: true, length: 1 },
)

const getHashForFilePath = async (filePath) => {
  const stats = await fsp.stat(filePath)
  return hashFileContents(
    `${filePath}:${stats.mtimeMs}:${stats.size}`,
    filePath,
  )
}

export default getHashForFilePath
