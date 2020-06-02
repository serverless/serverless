'use strict';

const YAML = require('js-yaml');
const resolve = require('json-refs').resolveRefs;

class YamlParser {
  constructor(serverless) {
    this.serverless = serverless;
  }

  parse(yamlFilePath) {
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
    return resolve(root, options).then(res => res.resolved);
  }
}

module.exports = YamlParser;
