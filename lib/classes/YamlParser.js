'use strict';

const YAML = require('js-yaml');
const jsonRefs = require('json-refs');

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
    return jsonRefs.resolveRefsAt(yamlFilePath, options).then((res) => {
      jsonRefs.clearCache();
      return res.resolved;
    });
  }
}

module.exports = YamlParser;
