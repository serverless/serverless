'use strict';

/**
 * Serverless Meta Class
 */

const SError         = require('./ServerlessError'),
  SUtils           = require('./utils/index'),
  ServerlessModule = require('./ServerlessModule'),
  path             = require('path'),
  fs               = require('fs'),
  BbPromise        = require('bluebird');

class ServerlessMeta {

  /**
   * Constructor
   * - options.projectPath: absolute path to project
   */

  constructor(Serverless, options) {
    this.S       = Serverless;
    this.options = options || {};
    this.load();
  }

  /**
   * Load
   * - Load from source (i.e., file system);
   */

  load() {

    let _this = this;

    // Defaults
    _this.data          = {};
    _this.data.private  = {
      stages: {},
      variables: {}
    };
    _this.data.public   = {
      variables: {}
    };

    // If no project path exists, return
    if (!_this.S.config.projectPath) return;

    // Re-usable function to traverse public or private variable folders
    let _getVariables = function(type) {

      let variableFiles = fs.readdirSync(path.join(_this.S.config.projectPath, 'meta', type, 'variables'));
      for (let i = 0; i < variableFiles.length; i++) {

        let variableFile = SUtils.readAndParseJsonSync(path.join(_this.S.config.projectPath, 'meta', type, 'variables', variableFiles[i]));

        // Parse file name to get stage/region
        let file = variableFiles[i].replace('s-variables-', '').replace('.json', '');

        if (file === 'common') {

          // Set Common variables
          _this.data[type].variables = SUtils.readAndParseJsonSync(path.join(_this.S.config.projectPath, 'meta', type, 'variables', variableFiles[i]));

        } else if (type === 'private') {

          // Set Stage/Region variables
          file = file.split('-');
          if (!_this.data[type].stages) _this.data[type].stages = {};
          if (!_this.data[type].stages[file[0]]) _this.data[type].stages[file[0]] = {
            regions:   {},
            variables: {}
          };

          if (file.length === 1) {

            // Set Stage Variables
            _this.data[type].stages[file[0]].variables = SUtils.readAndParseJsonSync(path.join(_this.S.config.projectPath, 'meta', type, 'variables', variableFiles[i]));

          } else if (file.length === 2) {

            // Set Stage-Region Variables
            let region;
            if (file[1] === 'useast1')      region = 'us-east-1';
            if (file[1] === 'uswest2')      region = 'us-west-2';
            if (file[1] === 'euwest1')      region = 'eu-west-1';
            if (file[1] === 'apnortheast1') region = 'ap-northeast-1';
            if (!_this.data[type].stages[file[0]].regions[region]) _this.data[type].stages[file[0]].regions[region] = {
              variables: SUtils.readAndParseJsonSync(path.join(_this.S.config.projectPath, 'meta', type, 'variables', variableFiles[i]))
            };
          }
        }
      }
    };

    if (SUtils.dirExistsSync(path.join(_this.S.config.projectPath, 'meta', 'public'))) _getVariables('public');
    if (SUtils.dirExistsSync(path.join(_this.S.config.projectPath, 'meta', 'private'))) _getVariables('private');

    // TODO: Validate

  }

  /**
   * Get
   * - Returns clone of data
   */

  get() {
    return JSON.parse(JSON.stringify(this.data));
  }

  /**
   * save
   * - persist data
   */

  save() {

    let _this = this;

    // Re-usable function to save public or private variables
    let _saveVariables = function(type) {

      // Save Common Variables
      fs.writeFileSync(path.join(_this.S.config.projectPath, 'meta', type, 'variables', 's-variables-common.json'),
        JSON.stringify(_this.data[type].variables, null, 2));

      if (type === 'private') {

        for (let i = 0; i < Object.keys(_this.data[type].stages).length; i++) {

          let stage = _this.data[type].stages[Object.keys(_this.data[type].stages)[i]];

          // Save Stage Variables
          fs.writeFileSync(path.join(_this.S.config.projectPath, 'meta', type, 'variables', 's-variables-' + Object.keys(_this.data[type].stages)[i] + '.json'),
            JSON.stringify(stage.variables, null, 2));

          // Save Stage Region Variables
          for (let j = 0; j < Object.keys(stage.regions).length; j++) {
            fs.writeFileSync(path.join(_this.S.config.projectPath, 'meta', type, 'variables', 's-variables-' + Object.keys(_this.data[type].stages)[i] + '-' + Object.keys(stage.regions)[j].replace(/-/g, '') + '.json'),
              JSON.stringify(stage.regions[Object.keys(stage.regions)[j]].variables, null, 2));
          }
        }
      }
    };

    if (SUtils.dirExistsSync(path.join(_this.S.config.projectPath, 'meta', 'public'))) _saveVariables('public');
    if (SUtils.dirExistsSync(path.join(_this.S.config.projectPath, 'meta', 'private'))) _saveVariables('private');
  }
}

module.exports = ServerlessMeta;