import jc from 'json-cycle'
import yaml from 'js-yaml'
import _ from 'lodash'
import cloudformationSchema from '@serverless/utils/cloudformation-schema.js'

const loadYaml = (contents, options) => {
  let data
  let error
  try {
    data = yaml.load(contents.toString(), options || {})
  } catch (exception) {
    error = exception
  }
  return { data, error }
}

function parse(filePath, contents) {
  // Auto-parse JSON
  if (filePath.endsWith('.json') || filePath.endsWith('.tfstate')) {
    return jc.parse(contents)
  } else if (filePath.endsWith('.yml') || filePath.endsWith('.yaml')) {
    const options = {
      filename: filePath,
    }
    let result = loadYaml(contents.toString(), options)
    if (result.error && result.error.name === 'YAMLException') {
      _.merge(options, { schema: cloudformationSchema })
      result = loadYaml(contents.toString(), options)
    }
    if (result.error) {
      throw result.error
    }
    return result.data
  }
  return contents.toString().trim()
}

export default parse
