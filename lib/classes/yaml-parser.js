import yaml from 'js-yaml'
import { resolveRefs } from 'json-refs'

class YamlParser {
  constructor(serverless) {
    this.serverless = serverless
  }

  async parse(yamlFilePath) {
    const root = this.serverless.utils.readFileSync(yamlFilePath)
    const options = {
      filter: ['relative', 'remote'],
      loaderOptions: {
        processContent: (res, callback) => {
          callback(null, yaml.load(res.text))
        },
      },
      location: yamlFilePath,
    }
    return resolveRefs(root, options).then((res) => res.resolved)
  }
}

export default YamlParser
