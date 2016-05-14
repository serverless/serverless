'use strict'

const path = require('path');
const YAML = require('js-yaml');
const resolve = require('json-refs').resolveRefs;
const BbPromise = require('bluebird');
const Utils = require('../classes/Utils')({});

module.exports = function (S) {

  class YamlParser {

    constructor() {
      this._class = 'YamlParser';
    }

    parseYaml(yamlFilePath) {
      const SUtils = new Utils();

      let parentDir = yamlFilePath.split(path.sep);
      parentDir.pop();
      parentDir = parentDir.join('/');
      process.chdir(parentDir);

      const root = YAML.load(SUtils.readFileSync(yamlFilePath).toString());
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

  return YamlParser;

};
