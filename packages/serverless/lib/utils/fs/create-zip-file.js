import fs from 'fs'
import path from 'path'
import archiver from 'archiver'
import walkDirSync from './walk-dir-sync.js'

async function createZipFile(srcDirPath, outputFilePath) {
  const files = walkDirSync(srcDirPath).map((file) => ({
    input: file,
    output: file.replace(path.join(srcDirPath, path.sep), ''),
  }))

  return new Promise((resolve, reject) => {
    const output = fs.createWriteStream(outputFilePath)
    const archive = archiver('zip', {
      zlib: { level: 9 },
    })

    output.on('open', async () => {
      archive.pipe(output)

      try {
        await Promise.all(
          files.map(async (file) => {
            const stats = await fs.promises.lstat(file.input)
            if (stats.isFile()) {
              archive.append(fs.createReadStream(file.input), {
                name: file.output,
              })
            }
          })
        )
        archive.finalize()
      } catch (err) {
        reject(err)
      }
    })

    archive.on('error', (err) => reject(err))
    output.on('close', () => resolve(outputFilePath))
  })
}

export default createZipFile
