'use strict';

const YAML = require('js-yaml');
const resolve = require('json-refs').resolveRefs;

class YamlParser {
  constructor(serverless) {
    this.serverless = serverless;
  }

  async parse(yamlFilePath) {
    const root = this.serverless.utils.readFileSync(yamlFilePath);
    const options = {
      filter: ['relative', 'remote'],
      loaderOptions: {
        processContent: (res, callback) => {
          callback(null, YAML.load(res.text));
        },
      },
      location: yamlFilePath,
    };
    const res = await resolve(root, options);
    return res.resolved;
  }
}

module.exports = YamlParser;
