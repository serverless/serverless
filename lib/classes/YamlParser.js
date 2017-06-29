'use strict';

const YAML = require('js-yaml');
const resolve = require('json-refs').resolveRefsAt;

class YamlParser {

  constructor(serverless) {
    this.serverless = serverless;
  }

  parse(yamlFilePath) {
    const options = {
      filter: ['relative', 'remote'],
      loaderOptions: {
        processContent: (res, callback) => {
          callback(null, YAML.load(res.text));
        },
      },
    };
    return resolve(yamlFilePath, options).then((res) => (res.resolved));
  }
}

module.exports = YamlParser;
