'use strict';

const path = require('path');
const YAML = require('js-yaml');
const resolve = require('json-refs').resolveRefs;

class YamlParser {
  constructor(serverless) {
    this.serverless = serverless;
  }

  parse(yamlFilePath) {
    let parentDir = yamlFilePath.split(path.sep);
    parentDir.pop();
    parentDir = parentDir.join('/');

    const root = this.serverless.utils.readFileSync(yamlFilePath);
    const options = {
      filter: ['relative', 'remote'],
      loaderOptions: {
        processContent: (res, callback) => {
          callback(null, YAML.load(res.text));
        },
      },
      relativeBase: parentDir,
    };
    return resolve(root, options).then(res => {
      // convert "true" to true, and "false" to false
      const booleanized = JSON.stringify(res.resolved)
        .replace(/"true"/g, 'true')
        .replace(/"false"/g, 'false');
      return JSON.parse(booleanized);
    });
  }
}

module.exports = YamlParser;
