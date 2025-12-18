import fse from 'fs-extra'
import parse from './parse.js'

function readFileSync(filePath) {
  const contents = fse.readFileSync(filePath)
  return parse(filePath, contents)
}

export default readFileSync
