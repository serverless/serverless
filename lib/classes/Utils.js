'use strict';

const SError = require('./Error');
const SCLI = require('./CLI');
const path = require('path');
const traverse = require('traverse');
const replaceall = require('replaceall');
const YAML = require('js-yaml');
const dotenv = require('dotenv');
const rawDebug = require('debug');
const _ = require('lodash');
const os = require('os');
const BbPromise = require('bluebird');
const fse = BbPromise.promisifyAll(require('fs-extra'));

class Utils {

  constructor() {
    this._class = 'Utils';
  }

  dirExistsSync(path) {
    try {
      let stats = fse.statSync(path);
      return stats.isDirectory();
    }
    catch (e) {
      return false;
    }
  }

  fileExistsSync(path) {
    try {
      let stats = fse.lstatSync(path);
      return stats.isFile();
    }
    catch (e) {
      return false;
    }
  }

  writeFileSync(filePath, contents) {

    contents = contents || '';

    fse.mkdirsSync(path.dirname(filePath));

    if (filePath.indexOf('.json') !== -1 && typeof contents !== 'string') {
      contents = JSON.stringify(contents, null, 2)
    }

    if (filePath.indexOf('.yaml') !== -1 && typeof contents !== 'string') {
      contents = YAML.dump(contents)
    }

    return fse.writeFileSync(filePath, contents);
  }

  writeFile(filePath, contents) {
    let _this = this;
    return new BbPromise(function (resolve, reject) {
      try {
        _this.writeFileSync(filePath, contents);
      } catch (e) {
        reject(e);
      }
      resolve();
    });
  }

  readFileSync(filePath) {

    let contents;

    // TODO: Reference the CLI class
    //this.sDebug(`Reading file: ${filePath}...`);

    // Read file
    contents = fse.readFileSync(filePath);

    // Auto-parse JSON
    if (filePath.endsWith('.json')) contents = JSON.parse(contents);

    return contents;
  }

  readFile(filePath) {
    let _this = this, contents;
    return new BbPromise(function (resolve, reject) {
      try {
        contents = _this.readFileSync(filePath);
      } catch (e) {
        reject(e);
      }
      resolve(contents);
    });
  }

  exportObject(data) {

    let convert = function (instance) {
      let obj = {};
      for (let i = 0; i < Object.keys(instance).length; i++) {
        let key = Object.keys(instance)[i];
        if (instance.hasOwnProperty(key) && !key.startsWith('_') &&
          typeof instance[key] !== 'function') {
          obj[key] = instance[key];
        }
      }
      return obj;
    };

    data = {data: data};

    traverse(data).forEach(function (val) {
      if (val && val._class) {
        let newVal = convert(val);
        return this.update(newVal);
      }
    });

    return data.data;
  }

  generateShortId(maxLen) {
    return (Math.round((Math.random() * Math.pow(36, maxLen)))).toString(36);
  }

  populate(service, data, options) {
    options = options || {};
    // Validate required params
    if (!service || !data) throw new SError(`Missing service instance or data object`);

    // Validate: Check stage exists
    if (options.stage) service.getStage(options.stage);

    // Validate: Check region exists in stage
    if (options.region) service.getRegionInStage(options.stage, options.region);

    let varTemplateSyntax = /\${([\s\S]+?)}/g;

    if (service.variableSyntax) {
      varTemplateSyntax = RegExp(service.variableSyntax, 'g');
    }

    // Populate variables
    let variablesObject = service.getVariables(options.stage, options.region);

    traverse(data).forEach(function (val) {

      let t = this;

      // check if the current string is a variable
      if (typeof(val) === 'string' && val.match(varTemplateSyntax)) {

        // get all ${variable} in the string
        val.match(varTemplateSyntax).forEach(function (variableSyntax) {

          let variableName = variableSyntax.replace(varTemplateSyntax, (match, varName) => varName.trim());
          let value;

          if (variableName in variablesObject) {
            value = variablesObject[variableName];
          }
          // Populate
          if (!value && !value !== "") {
            SCLI.log('WARNING: This variable is not defined: ' + variableName);
          } else if (typeof value === 'string') {

            // for string variables, we use replaceall in case the user
            // includes the variable as a substring (ie. "hello ${name}")
            val = replaceall(variableSyntax, value, val);
          } else {
            val = value;
          }
        });

        // Replace
        t.update(val);
      }
    });
    return data;
  }

}

module.exports = Utils;
