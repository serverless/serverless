'use strict'

const path = require('path');
const YAML = require('js-yaml');
const resolve = require('json-refs').resolveRefs;
const BbPromise = require('bluebird');

class YamlParser {

  constructor(S) {
    this._class = 'YamlParser';
    this.S = S;
  }

  parse(yamlFilePath) {

    let parentDir = yamlFilePath.split(path.sep);
    parentDir.pop();
    parentDir = parentDir.join('/');
    process.chdir(parentDir);

    const root = YAML.load(this.S.instances.utils.readFileSync(yamlFilePath).toString());
    const options = {
      filter : ['relative', 'remote'],
      loaderOptions: {
        processContent: function (res, callback) {
          callback(null, YAML.load(res.text));
        },
      },
    };
    return resolve(root, options).then(function (res) {
      return BbPromise.resolve(res.resolved);
    });
  }
}

module.exports = YamlParser;