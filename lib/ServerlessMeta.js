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

  load(projectPath) {

    let _this = this;

    // Set projectPath
    if (projectPath) _this.projectPath = projectPath;

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
    if (!_this.options.projectPath) return;

    // Re-usable function to traverse public or private variable folders
    let _getVariables = function(type) {

      let variableFiles = fs.readdirSync(path.join(_this.options.projectPath, 'meta', type, 'variables'));
      for (let i = 0; i < variableFiles.length; i++) {

        let variableFile = SUtils.readAndParseJsonSync(path.join(_this.options.projectPath, 'meta', type, 'variables', variableFiles[i]));

        // Parse file name to get stage/region
        let file = variableFiles[i].replace('s-variables-', '').replace('.json', '');

        if (file === 'common') {

          // Set Common variables
          _this.data[type].variables = _this.readAndParseJsonSync(path.join(_this.options.projectPath, 'meta', type, 'variables', variableFiles[i]));

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
            _this.data[type].stages[file[0]].variables = _this.readAndParseJsonSync(path.join(projectRootPath, 'meta', type, 'variables', variableFiles[i]));

          } else if (file.length === 2) {

            // Set Stage-Region Variables
            let region;
            if (file[1] === 'useast1')      region = 'us-east-1';
            if (file[1] === 'uswest2')      region = 'us-west-2';
            if (file[1] === 'euwest1')      region = 'eu-west-1';
            if (file[1] === 'apnortheast1') region = 'ap-northeast-1';
            if (!_this.data[type].stages[file[0]].regions[region]) _this.data[type].stages[file[0]].regions[region] = {
              variables: _this.readAndParseJsonSync(path.join(_this.options.projectPath, 'meta', type, 'variables', variableFiles[i]))
            };
          }
        }
      }
    };

    if (SUtils.dirExistsSync(path.join(_this.options.projectPath, 'meta', 'public'))) _getVariables('public');
    if (SUtils.dirExistsSync(path.join(_this.options.projectPath, 'meta', 'private'))) _getVariables('private');

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
   * Set
   * - Update data
   */

  set(data) {

    // TODO: Validate data

    this.data = data;
  }

  /**
   * Set Path
   * - Updates project path
   */

  setProjectPath(projectPath) {
    this.options.projectPath = projectPath;
  }
}

module.exports = ServerlessMeta;