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

    // TODO: Reference the CLI class
    //this.sDebug(`Writing file: ${filePath}...`);

    if (contents === undefined) {
      contents = '';
    }

    try {
      fse.mkdirsSync(path.dirname(filePath));
    } catch (e) {
      throw new SError(`Error creating parent folders when writing this file: ${filePath} ${e.message}`);
    }

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
    try {
      contents = fse.readFileSync(filePath);
    } catch (e) {
      throw new SError(`Error reading file ${filePath}
		${e.message}`);
    }

    // Auto-parse JSON
    if (filePath.endsWith('.json')) {
      try {
        contents = JSON.parse(contents);
      } catch (e) {
        throw new SError(`Could not parse JSON in file: ${filePath}`);
      }
    }

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

  npmInstall(dir) {
    process.chdir(dir);

    if (exec('npm install ', {silent: false}).code !== 0) {
      throw new SError(`Error executing NPM install on ${dir}`, SError.errorCodes.UNKNOWN);
    }

    process.chdir(process.cwd());
  }

  findServicePath(startDir) {

    let _this = this;

    // Helper function
    let isServiceDir = function (dir) {
      let yamlName = 'serverless.yml';
      let yamlFilePath = path.join(dir, yamlName);

      if (_this.fileExistsSync(yamlFilePath)) {
        let serviceYaml = _this.readFileSync(yamlFilePath);
        if (typeof serviceYaml.service !== 'undefined') {
          return true;
        }
      }
      return false;
    };

    // Check up to 10 parent levels
    let previous = '.',
      servicePath = undefined,
      i = 10;

    while (i >= 0) {
      let fullPath = path.resolve(startDir, previous);

      if (isServiceDir(fullPath)) {
        servicePath = fullPath;
        break;
      }

      previous = path.join(previous, '..');
      i--;
    }

    return servicePath;
  }

  getFunctionsByCwd(allFunctions) {
    // we add a trailing slash to notate that it's the end of the folder name
    // this is just to avoid matching sub folder names that are substrings of other subfolder names
    let cwd = process.cwd() + path.sep,
      functions = [];

    allFunctions.forEach(function (func) {
      if (func.getFilePath().indexOf(cwd) != -1) functions.push(func);
    });

    // if no functions in cwd, add all functions
    if (functions.length === 0) functions = allFunctions;

    return functions;
  }

  getLifeCycleEvents(command, availableCommands, prefix) {
    prefix = prefix || '';
    const commandPart = command[0];
    if (_.has(availableCommands, commandPart)) {
      const commandDetails = availableCommands[commandPart];
      if (command.length === 1) {
        const events = [];
        commandDetails.lifeCycleEvents.forEach((event) => {
          events.push(`${prefix}${commandPart}:${event}Pre`);
          events.push(`${prefix}${commandPart}:${event}`);
          events.push(`${prefix}${commandPart}:${event}Post`);
        });
        return events;
      }
      if (_.has(commandDetails, 'commands')) {
        return getEvents(command.slice(1, command.length), commandDetails.commands, `${commandPart}:`);
      }
    }

    return [];
  }

}

module.exports = Utils;
