import fse from 'fs-extra'
import path from 'path'
import jc from 'json-cycle'
import yaml from 'js-yaml'

function writeFileSync(filePath, conts, cycles) {
  let contents = conts || ''

  fse.mkdirsSync(path.dirname(filePath))

  if (filePath.indexOf('.json') !== -1 && typeof contents !== 'string') {
    if (cycles) {
      contents = jc.stringify(contents, null, 2)
    } else {
      contents = JSON.stringify(contents, null, 2)
    }
  }

  const yamlFileExists = filePath.indexOf('.yaml') !== -1
  const ymlFileExists = filePath.indexOf('.yml') !== -1

  if ((yamlFileExists || ymlFileExists) && typeof contents !== 'string') {
    contents = yaml.dump(contents)
  }

  return fse.writeFileSync(filePath, contents)
}

export default writeFileSync
