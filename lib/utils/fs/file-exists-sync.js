import fse from 'fs-extra'

function fileExistsSync(filePath) {
  try {
    const stats = fse.statSync(filePath)
    return stats.isFile()
  } catch (e) {
    return false
  }
}

export default fileExistsSync
