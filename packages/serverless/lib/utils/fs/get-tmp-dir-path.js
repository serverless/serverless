import os from 'os'
import path from 'path'
import crypto from 'crypto'

const tmpDirCommonPath = path.join(
  os.tmpdir(),
  'tmpdirs-serverless',
  crypto.randomBytes(2).toString('hex'),
)

function getTmpDirPath() {
  return path.join(tmpDirCommonPath, crypto.randomBytes(8).toString('hex'))
}

export default getTmpDirPath
