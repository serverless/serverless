'use strict';

/**
 * Serverless Component Class
 */

const SError       = require('./ServerlessError'),
  SUtils           = require('./utils/index'),
  BbPromise        = require('bluebird'),
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

    let _this     = this;
    _this._S      = Serverless;
    _this._config = {};
    _this.updateConfig(config);

    // Default Properties
    _this.name           = _this._config.component || 'component' + SUtils.generateShortId(6);
    _this.runtime        = 'nodejs';
  }

  /**
   * Update Config
   * - Takes config.component
   */

  updateConfig(config) {

    if (!config) return;

    // Set sPath
    if (config.component) {
      this._config.component = config.component;
      this._config.sPath     = SUtils.buildSPath({
        component: config.component
      });
    }

    // Make full path
    if (this._S.config.projectPath && this._config.sPath) {
      let parse = SUtils.parseSPath(this._config.sPath);
      this._config.fullPath = path.join(this._S.config.projectPath, parse.component);
    }
  }

  /**
   * Load
   * - Load from source (i.e., file system);
   * - Returns promise
   */

  load() {

    let _this = this,
      componentJson,
      componentContents;

    return BbPromise.try(function() {

        // Validate: Check project path is set
        if (!_this._S.config.projectPath) throw new SError('Component could not be loaded because no project path has been set on Serverless instance');

        // Validate: Check component exists
        if (!SUtils.fileExistsSync(path.join(_this._config.fullPath, 's-component.json'))) {
          throw new SError('Component could not be loaded because it does not exist in your project: ' + _this._config.sPath);
        }

        componentJson         = SUtils.readAndParseJsonSync(path.join(_this._config.fullPath, 's-component.json'));
        componentJson.modules = {};
        componentContents     = fs.readdirSync(_this._config.fullPath);

        return componentContents;
      })
      .each(function(m, i) {

        if (!SUtils.fileExistsSync(path.join(
            _this._config.fullPath, componentContents[i],
            's-module.json'))) return;

        let module = new _this._S.classes.Module(_this._S, {
          component: _this._config.component,
          module:    m
        });

        return module.load()
          .then(function(instance) {
            componentJson.modules[m]= instance;
            return componentJson.modules[m];
          });
      })
      .then(function() {

        // Merge
        _.assign(_this, componentJson);
        return _this;
      });
  }

  /**
   * Set
   * - Set data
   * - Accepts a data object
   */

  set(data) {
    let _this = this;

    // Instantiate Components
    for (let prop in data.modules) {

      if (data.modules[prop] instanceof _this._S.classes.Module) {
        throw new SError('You cannot pass subclasses into the set method, only object literals');
      }

      let instance = new _this._S.classes.Module(_this._S, {
        component: _this._config.component,
        module:    prop
      });
      data.modules[prop] = instance.set(data.modules[prop]);
    }

    // Merge in
    _this = _.extend(_this, data);
    return _this;
  }

  /**
   * Get
   * - Returns clone of data
   */

  get() {
    let clone = _.cloneDeep(this);
    for (let prop in this.modules) {
      clone.modules[prop] = this.modules[prop].get();
    }
    return SUtils.exportClassData(clone);
  }

  /**
   * getPopulated
   * - Fill in templates then variables
   */

  getPopulated(options) {
    let _this = this;

    options = options || {};

    // Validate: Check Stage & Region
    if (!options.stage || !options.region) throw new SError('Both "stage" and "region" params are required');

    // Validate: Check project path is set
    if (!this._S.config.projectPath) throw new SError('Component could not be populated because no project path has been set on Serverless instance');

    // Populate module and its functions
    let clone = _.cloneDeep(this);
    if (clone.modules) clone.modules = {};

    return SUtils.populate(this._S, clone, options.stage, options.region)
      .then(function(data) {
        clone = data;
        clone.modules = {};
        for (let prop in _this.modules) {
          _this.modules[prop].getPopulated(options)
            .then(function(data) {
              clone.modules[prop] = data;
            });
        }
      })
      .then(function(){
        return clone;
      });
  }

  /**
   * Get Templates
   * - Get templates in this component
   * - Returns Promise
   */

  getTemplates() {

    let _this   = this,
      templates = {};

    return BbPromise.try(function() {
        return Object.keys(_this.modules);
      })
      .each(function(m) {
        return _this.modules[m].getTemplates()
          .then(function(t) {
            templates[m] = t;
          })
      })
      .then(function() {
        return templates;
      });
  }

  /**
   * Save
   * - Saves data to file system
   * - Returns promise
   */

  save(options) {

    let _this = this;

    return new BbPromise.try(function() {

      // Validate: Check project path is set
      if (!_this._S.config.projectPath) throw new SError('Component could not be saved because no project path has been set on Serverless instance');

      // Create if does not exist
      if (!SUtils.fileExistsSync(path.join(_this._config.fullPath, 's-component.json'))) {
        return _this._create();
      }
    })
      .then(function() {

        // Save all nested modules
        if (options && options.deep) {
          return BbPromise.try(function () {
              return Object.keys(_this.modules);
            })
            .each(function(m) {
              return _this.modules[m].save();
            })
        }
      })
      .then(function() {

        let clone = _this.get();

        // Strip modules property
        if (clone.modules) delete clone.modules;

        // Write file
        return SUtils.writeFile(path.join(_this._config.fullPath, 's-component.json'),
          JSON.stringify(clone, null, 2));
      })
      .then(function() {
        return _this;
      })
  }

  /**
   * Create (scaffolding)
   * - Returns promise
   */

  _create() {

    let _this              = this,
      writeDeferred        = [];

    return BbPromise.try(function() {

      // Runtime: nodejs
      if (_this.runtime === 'nodejs') {

        let packageJsonTemplate = SUtils.readAndParseJsonSync(path.join(_this._S.config.serverlessPath, 'templates', 'nodejs', 'package.json')),
          libJs = fs.readFileSync(path.join(_this._S.config.serverlessPath, 'templates', 'nodejs', 'index.js'));

        writeDeferred.push(
          fs.mkdirSync(_this._config.fullPath),
          fs.mkdirSync(path.join(_this._config.fullPath, 'lib')),
          SUtils.writeFile(path.join(_this._config.fullPath, 'lib', 'index.js'), libJs),
          SUtils.writeFile(path.join(_this._config.fullPath, 'package.json'), JSON.stringify(packageJsonTemplate, null, 2))
        );
      }

      return BbPromise.all(writeDeferred);
    });
  }
}

module.exports = ServerlessComponent;