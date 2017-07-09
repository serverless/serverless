'use strict';

const YAML = require('js-yaml');
const jsonRefs = require('json-refs');
const BbPromise = require('bluebird');

class YamlParser {

  constructor(serverless) {
    this.serverless = serverless;
    this.queue = BbPromise.resolve();
  }

  resolve(yamlFilePath, options) {
    return jsonRefs.resolveRefsAt(yamlFilePath, options).then((res) => res.resolved);
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
    const queued = this.queue.then(() => this.resolve(yamlFilePath, options));
    this.queue = queued.finally(() => jsonRefs.clearCache());
    return queued;
  }
}

module.exports = YamlParser;
