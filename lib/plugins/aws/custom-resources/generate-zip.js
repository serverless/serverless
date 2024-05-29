import path from 'path'
import fse from 'fs-extra'
import { fileURLToPath } from 'url'
import getTmpDirPath from '../../../utils/fs/get-tmp-dir-path.js'
import createZipFile from '../../../utils/fs/create-zip-file.js'
import ensureArtifact from '../../../utils/ensure-artifact.js'
import safeMoveFile from '../../../utils/fs/safe-move-file.js'

let __dirname = path.dirname(fileURLToPath(import.meta.url))
if (__dirname.endsWith('dist')) {
  __dirname = path.join(__dirname, '../lib/plugins/aws/custom-resources')
}
const srcDirPath = path.join(__dirname, 'resources')

const artifactName = 'custom-resources.zip'

export default async () => {
  const resultPath = await ensureArtifact(artifactName, async (cachePath) => {
    const tmpDirPath = getTmpDirPath()
    const tmpInstalledLambdaPath = path.resolve(tmpDirPath, 'resource-lambda')
    const tmpZipFilePath = path.resolve(tmpDirPath, 'resource-lambda.zip')
    const cachedZipFilePath = path.resolve(cachePath, artifactName)
    await fse.copy(srcDirPath, tmpInstalledLambdaPath)
    await createZipFile(tmpInstalledLambdaPath, tmpZipFilePath)
    await safeMoveFile(tmpZipFilePath, cachedZipFilePath)
  })
  return path.resolve(resultPath, artifactName)
}
