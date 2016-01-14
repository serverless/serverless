'use strict';

/**
 * Serverless Module Class
 * - options.path format is: "moduleFolder"
 */

const SError         = require('./ServerlessError'),
  SUtils             = require('./utils/index'),
  ServerlessFunction = require('./ServerlessFunction'),
  path               = require('path'),
  _                  = require('lodash'),
  fs                 = require('fs');

class ServerlessModule {

  /**
   * Constructor
   */

  constructor(Serverless, config) {

    // Validate required attributes
    if (!config.component || !config.module) throw new SError('Missing required config.component or config.module');

    let _this    = this;
    _this.S      = Serverless;
    _this.config = {};
    _this.updateConfig(config);

    // Default Properties
    _this.data                = {};
    _this.data.name           = _this.config.module || 'module' + SUtils.generateShortId(6);
    _this.data.version        = '0.0.1';
    _this.data.profile        = 'aws-v' + require('../package.json').version;
    _this.data.location       = 'https://github.com/...';
    _this.data.author         = '';
    _this.data.description    = 'A Serverless Module';
    _this.data.runtime        = 'nodejs';
    _this.data.custom         = {};
    _this.data.functions      = {};
    _this.data.templates      = {};
    _this.data.cloudFormation = {
      resources: {},
      lambdaIamPolicyDocumentStatements: []
    };
  }

  /**
   * Update Config
   * - Takes config.component and config.module
   */

  updateConfig(config) {

    if (!config) return;

    // Set sPath
    if (config.component || config.module) {
      this.config.component = config.component;
      this.config.module    = config.module;
      this.config.sPath     = this.S.buildPath({
        component: config.component,
        module:    config.module
      });
    }
    // Make full path
    if (this.S.config.projectPath && this.config.sPath) {
      let parse            = this.S.parsePath(this.config.sPath);
      this.config.fullPath = path.join(this.S.config.projectPath, parse.component, parse.module);
    }
  }

  /**
   * Load
   * - Load from source (i.e., file system);
   */

  load() {

    let _this = this;

    // Validate: Check project path is set
    if (!_this.S.config.projectPath) throw new SError('Module could not be loaded because no project path has been set on Serverless instance');

    // Validate: Check module exists
    if (!SUtils.fileExistsSync(path.join(_this.config.fullPath, 's-module.json'))) {
      throw new SError('Module could not be loaded because it does not exist in your project: ' + _this.config.sPath);
    }

    let moduleJson = SUtils.readAndParseJsonSync(path.join(_this.config.fullPath, 's-module.json'));

    // Add Function Class Instances
    moduleJson.functions  = {};
    let moduleContents    = fs.readdirSync(_this.config.fullPath);
    for (let i = 0; i < moduleContents.length; i++) {
      if (SUtils.fileExistsSync(path.join(_this.config.fullPath, moduleContents[i], 's-function.json'))) {
        let func = new ServerlessFunction(_this.S, {
          component: _this.config.component,
          module:    _this.config.module,
          function:  moduleContents[i]
        });
        moduleJson.functions[func.name] = func.load();
      }
    }

    _this.data = moduleJson;
  }

  /**
   * Get
   * - Return data
   */

  get() {
    let clone = _.cloneDeep(this.data);
    for (let prop in clone.functions) {
      clone.functions[prop] = clone.functions[prop].get();
    }
    return clone;
  }

  /**
   * getPopulated
   * - Fill in templates then variables
   */

  getPopulated(options) {

    options = options || {};

    // Validate: Check Stage & Region
    if (!options.stage || !options.region) throw new SError('Both "stage" and "region" params are required');

    // Validate: Check project path is set
    if (!this.S.config.projectPath) throw new SError('Module could not be populated because no project path has been set on Serverless instance');

    // Populate module and its functions
    let clone = _.cloneDeep(this.data);
    if (clone.functions) clone.functions = {};
    clone = SUtils.populate(this.S, clone, options.stage, options.region);
    for (let prop in this.data.functions) {
      clone.functions[prop] = this.data[prop].getPopulated(options);
    }

    return clone;
  }

  /**
   * Get Templates
   * - Get templates in this module
   */

  getTemplates() {
    if (!SUtils.fileExistsSync(path.join(this.config.fullPath, 's-templates.json'))) {
      return {};
    } else {
      return SUtils.readAndParseJsonSync(path.join(this.config.fullPath, 's-templates.json'));
    }
  }

  /**
   * save
   * - Saves data to file system
   */

  save(options) {

    let _this = this;

    // Validate: Check project path is set
    if (!_this.S.config.projectPath) throw new SError('Module could not be saved because no project path has been set on Serverless instance');

    // Save all nested data
    if (options && options.deep) {

      // Loop over functions and save
      for (let prop in _this.data.functions) {
        _this.data.functions[prop].save(options);
      }
    }

    // Strip functions property
    let clone = _this.get();
    if (clone.functions) delete clone.functions;

    // Save JSON file
    fs.writeFileSync(path.join(
      _this.config.fullPath,
      's-module.json'),
      JSON.stringify(clone, null, 2));
  }
}

module.exports = ServerlessModule;