import path from 'path'
import fse from 'fs-extra'

export default {
  async cleanupTempDir() {
    if (this.serverless.serviceDir) {
      const serverlessTmpDirPath = path.join(
        this.serverless.serviceDir,
        '.serverless',
      )

      if (this.serverless.utils.dirExistsSync(serverlessTmpDirPath)) {
        fse.removeSync(serverlessTmpDirPath)
      }
    }
  },
}
