'use strict';

/**
 * Serverless Component Class
 */

const SError       = require('./ServerlessError'),
  SUtils           = require('./utils/index'),
  path             = require('path'),
  _                = require('lodash'),
  fs               = require('fs');

class ServerlessComponent {

  /**
   * Constructor
   */

  constructor(Serverless, config) {

    // Validate required attributes
    if (!config.component) throw new SError('Missing required config.component');

    let _this    = this;
    _this.S      = Serverless;
    _this.config = {};
    _this.updateConfig(config);

    // Default Properties
    _this.data                = {};
    _this.data.name           = _this.config.component || 'component' + SUtils.generateShortId(6);
    _this.data.runtime        = 'nodejs';
  }

  /**
   * Update Config
   * - Takes config.component
   */

  updateConfig(config) {

    if (!config) return;

    // Set sPath
    if (config.component) {
      this.config.component = config.component;
      this.config.sPath     = this.S.buildPath({
        component: config.component
      });
    }
    // Make full path
    if (this.S.config.projectPath && this.config.sPath) {
      let parse = this.S.parsePath(this.config.sPath);
      this.config.fullPath = path.join(this.S.config.projectPath, parse.component);
    }
  }

  /**
   * Load
   * - Load from source (i.e., file system);
   */

  load() {

    let _this = this;

    // Validate: Check project path is set
    if (!_this.S.config.projectPath) throw new SError('Component could not be loaded because no project path has been set on Serverless instance');

    // Validate: Check module exists
    if (!SUtils.fileExistsSync(path.join(_this.config.fullPath, 's-component.json'))) {
      throw new SError('Component could not be loaded because it does not exist in your project: ' + _this.config.sPath);
    }

    // Get Component JSON
    let componentJson = SUtils.readAndParseJsonSync(path.join(_this.config.fullPath, 's-component.json'));

    // Add module class instances
    componentJson.modules   = {};
    let componentContents   = fs.readdirSync(_this.config.fullPath);
    for (let i = 0; i < componentContents.length; i++) {
      if (SUtils.fileExistsSync(path.join(_this.config.fullPath, componentContents[i], 's-module.json'))) {
        let module = new _this.S.classes.Module(_this.S, {
          component: componentJson.name,
          module:    componentContents[i]
        });
        componentJson.modules[module.name] = module.load();
      }
    }

    _this.data = componentJson;
  }

  /**
   * Get
   * - Returns clone of data
   */

  get() {
    let clone = _.cloneDeep(this.data);
    for (let prop in clone.modules) {
      clone.modules[prop] = clone.modules[prop].get();
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
    if (!this.S.config.projectPath) throw new SError('Component could not be populated because no project path has been set on Serverless instance');

    // Populate module and its functions
    let clone = _.cloneDeep(this.data);
    if (clone.modules) clone.modules = {};
    clone = SUtils.populate(this.S, clone, options.stage, options.region);
    for (let prop in this.data.modules) {
      clone.modules[prop] = this.data[prop].getPopulated(options);
    }

    return clone;
  }

  /**
   * Get Templates
   * - Get templates in this component
   */

  getTemplates() {

    let templates = {};

    for (let prop in this.data.modules) {
      templates[prop] = this.data.modules[prop].getTemplates();
    }

    return templates;
  }

  /**
   * save
   * - Saves data to file system
   */

  save(options) {

    let _this = this;

    // Validate: Check project path is set
    if (!_this.S.config.projectPath) throw new SError('Component could not be saved because no project path has been set on Serverless instance');

    // Save all nested data
    if (options && options.deep) {

      // Loop over functions and save
      for (let prop in _this.data.modules) {
        _this.data.modules[prop].save(options);
      }
    }

    // Strip functions property
    let clone = _this.get();
    if (clone.modules) delete clone.modules;

    // Save JSON file
    fs.writeFileSync(path.join(
      _this.config.fullPath,
      's-component.json'),
      JSON.stringify(clone, null, 2));
  }
}

module.exports = ServerlessComponent;