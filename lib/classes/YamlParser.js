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
    process.chdir(parentDir);

    const root = YAML.load(this.serverless.utils.readFileSync(yamlFilePath).toString());
    const options = {
      filter: ['relative', 'remote'],
      loaderOptions: {
        processContent: (res, callback) => {
          callback(null, YAML.load(res.text));
        },
      },
    };
    return resolve(root, options).then((res) => (res.resolved));
  }
}

module.exports = YamlParser;
