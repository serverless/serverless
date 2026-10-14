import path from 'path'
import { emptyServerlessDir } from './serverless-dir.js'

export default {
  async cleanupTempDir() {
    if (this.serverless.serviceDir) {
      const serverlessTmpDirPath = path.join(
        this.serverless.serviceDir,
        '.serverless',
      )

      if (this.serverless.utils.dirExistsSync(serverlessTmpDirPath)) {
        // A Dev Mode session's record in .serverless/dev/ stays.
        emptyServerlessDir(serverlessTmpDirPath)
      }
    }
  },
}
