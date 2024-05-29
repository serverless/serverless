import fse from 'fs-extra'

function dirExistsSync(dirPath) {
  try {
    const stats = fse.statSync(dirPath)
    return stats.isDirectory()
  } catch (e) {
    return false
  }
}

export default dirExistsSync
