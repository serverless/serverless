'use strict';

/**
 * Serverless Function Class
 * - config.sPath is required
 * - config.component, config.module, config.function will be DEPRECATED soon.  Do not use!
 */

const SError   = require('./ServerlessError'),
  SUtils       = require('./utils/index'),
  BbPromise    = require('bluebird'),
  async        = require('async'),
  path         = require('path'),
  fs           = BbPromise.promisifyAll(require('fs')),
  _            = require('lodash');

class ServerlessFunction {

  /**
   * Constructor
   */

  constructor(Serverless, config) {

    // Validate required attributes
    if ((!config.component || !config.module || !config.function) && !config.sPath) throw new SError('Missing required config.sPath');

    let _this           = this;
    _this._S            = Serverless;
    _this._config       = {};
    _this.updateConfig(config);

    // Default properties
    _this.name          = _this._config.function || 'function' + SUtils.generateShortId(6);
    _this.customName    = false;
    _this.customRole    = false;
    _this.handler       = path.posix.join(
      _this._config.sPath.split('/').splice(1, _this._config.sPath.split('/').length).join('/'),
      'handler.handler');
    _this.timeout       = 6;
    _this.memorySize    = 1024;
    _this.custom        = {
      excludePatterns: [],
      envVars:         []
    };
    _this.endpoints     = [];
    _this.events        = [];
    _this.endpoints.push(new _this._S.classes.Endpoint(_this._S, {
      sPath:  _this._config.sPath +
      '@' +
      _this._config.sPath.split('/').splice(1, _this._config.sPath.split('/').length).join('/')
      + '~GET'
    }));
    _this.templates     = {};
  }

  /**
   * Set
   * - Set data
   * - Accepts a data object
   */

  set(data) {
    let _this = this;

    // Instantiate Endpoints
    for (let i = 0; i < data.endpoints.length; i++) {

      if (data.endpoints[i] instanceof _this._S.classes.Endpoint) {
        throw new SError('You cannot pass subclasses into the set method, only object literals');
      }

      let instance      = new _this._S.classes.Endpoint(_this._S, {
        sPath:           _this._config.sPath +  '@' + data.endpoints[i].path + '~' + data.endpoints[i].method
      });
      data.endpoints[i] = instance.set(data.endpoints[i]);
    }

    // Instantiate Events
    for (let i = 0; i < data.events.length; i++) {

      if (data.events[i] instanceof _this._S.classes.Event) {
        throw new SError('You cannot pass subclasses into the set method, only object literals');
      }

      let instance      = new _this._S.classes.Event(_this._S, {
        sPath:           _this._config.sPath +  '#' + data.events[i].name
      });
      data.events[i] = instance.set(data.events[i]);
    }

    // Merge
    _.assign(_this, data);
    return _this;
  }

  /**
   * Update Config
   * - Takes config.sPath
   */

  updateConfig(config) {

    if (!config) return;

    // Set sPath
    if (config.component || config.module || config.function) {
      this._config.sPath      = config.component + '/' + config.module + '/' + config.function;
    }
    if (config.sPath) {
      this._config.sPath = config.sPath;
    }

    // Make full path
    if (this._S.config.projectPath && this._config.sPath) {
      this._config.fullPath = path.join(this._S.config.projectPath, this._config.sPath.split('/').join(path.sep));
    }
  }

  /**
   * Load
   * - Load from source (i.e., file system);
   * - Returns Promise
   */

  load() {

    let _this = this,
      functionJson;

    return BbPromise.try(function() {

        // Validate: Check project path is set
        if (!_this._S.config.projectPath) throw new SError('Function could not be loaded because no project path has been set on Serverless instance');

        // Validate: Check function exists
        if (!SUtils.fileExistsSync(path.join(_this._config.fullPath, 's-function.json'))) {
          throw new SError('Function could not be loaded because it does not exist in your project: ' + _this._config.sPath);
        }

        functionJson = SUtils.readAndParseJsonSync(path.join(_this._config.fullPath, 's-function.json'));
        return functionJson.endpoints ? functionJson.endpoints : [];
      })
      .each(function(e, i) {

        // Add Endpoint Class Instances
        functionJson.endpoints[i] = new _this._S.classes.Endpoint(_this._S, {
          sPath:  _this._config.sPath +  '@' + e.path + '~' + e.method
        });

        return functionJson.endpoints[i].load()
          .then(function(instance) {
            functionJson.endpoints[i] = instance;
            return functionJson.endpoints[i];
          });
      })
      .then(function() {
        return functionJson.events ? functionJson.events : [];
      })
      .each(function(e, i) {

        // Add Endpoint Class Instances
        functionJson.events[i] = new _this._S.classes.Event(_this._S, {
          sPath:  _this._config.sPath +  '#' + e.name
        });

        return functionJson.events[i].load()
          .then(function(instance) {
            functionJson.events[i] = instance;
            return functionJson.events[i];
          });
      })
      .then(function() {

        // Get templates
        if (_this._config.fullPath && SUtils.fileExistsSync(path.join(_this._config.fullPath, 's-templates.json'))) {
          functionJson.templates = require(path.join(_this._config.fullPath, 's-templates.json'));
        }

        // Get templates in parent folders and merge into this.templates
        let parentOne = path.join(_this._config.fullPath, '..'),
          parentTwo   = path.join(_this._config.fullPath, '..', '..'),
          parentTemplateOne = {},
          parentTemplateTwo = {};

        if (!SUtils.fileExistsSync(path.join(parentOne, 's-component.json'))) {
          if (SUtils.fileExistsSync(path.join(parentOne, 's-templates.json'))) {
            parentTemplateOne = SUtils.readAndParseJsonSync(path.join(parentOne, 's-templates.json'));
          }

          if (!SUtils.fileExistsSync(path.join(parentTwo, 's-component.json'))) {
            if (SUtils.fileExistsSync(path.join(parentTwo, 's-templates.json'))) {
              parentTemplateTwo = SUtils.readAndParseJsonSync(path.join(parentTwo, 's-templates.json'));
            }
          }
        }

        // Merge
        functionJson.templates = _.merge(
          parentTemplateTwo,
          parentTemplateOne,
          functionJson.templates
        );
      })
      .then(function() {

        // Merge
        _.assign(_this, functionJson);
        return _this;
      });
  }

  /**
   * Get
   * - Return data
   */

  get() {

    let _this = this;

    let clone  = _.cloneDeep(_this);
    for (let i = 0; i < _this.endpoints.length; i++) {
      clone.endpoints[i] = _this.endpoints[i].get();
    }
    for (let i = 0; i < _this.events.length; i++) {
      clone.events[i] = _this.events[i].get();
    }
    return SUtils.exportClassData(clone);
  }

  /**
   * Get Deployed Name
   * - Uses Lambda name or template name
   * - Stage and Region are required since customName could use variables
   */

  getDeployedName(options) {

    // Validate: options.state and options.region are required
    if (!options.stage || !options.region) {
      throw new SError(`Stage and region options are required`);
    }

    let name = this.getProject().name + '-' + this.getComponent().name;

    // Backwards Compatibility Support
    // TODO: Remove in V1 because will result in breaking change
    if (this._config.sPath.split('/').length == 3) {

      // Check if s-module.json exists in subfolder
      if (SUtils.fileExistsSync(path.join(
              this._S.config.projectPath,
              this._config.sPath.split('/').splice(0, 2).join(path.sep),
              's-module.json'))) {
        name = name + '-' + this._config.sPath.split('/')[1];
      }
    }

    // Add function name
    name = name + '-' + this.name;

    // If customName, use that
    if (options.stage && options.region && this.customName) {
      name = this.getPopulated({
        stage:  options.stage,
        region: options.region }).customName;
    }

    return name;
  }

  /**
   * getPopulated
   * - Fill in templates then variables
   * - Returns Promise
   */

  getPopulated(options) {

    let _this = this;

    options = options || {};

    // Validate: Check Stage & Region
    if (!options.stage || !options.region) throw new SError('Both "stage" and "region" params are required');

    // Validate: Check project path is set
    if (!_this._S.config.projectPath) throw new SError('Function could not be populated because no project path has been set on Serverless instance');

    // Populate
    let clone       = _this.get();
    clone           = SUtils.populate(_this._S.state.getMeta(), _this.getTemplates(), clone, options.stage, options.region);
    clone.endpoints = [];
    for (let i = 0; i < _this.endpoints.length; i++) {
      clone.endpoints[i] = _this.endpoints[i].getPopulated(options);
    }
    return clone;
  }

  /**
   * Get Templates
   * - Returns clone of templates
   * - Inherits parent templates
   */

  getTemplates() {
    return _.merge(
      this.getProject().getTemplates(),
      this.getComponent().getTemplates(),
      _.cloneDeep(this.templates)
    );
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
      if (!_this._S.config.projectPath) throw new SError('Function could not be saved because no project path has been set on Serverless instance');

      // Create if does not exist
      if (!SUtils.fileExistsSync(path.join(_this._config.fullPath, 's-function.json'))) {
        return _this._create();
      }
    })
      .then(function() {

        // Save all nested endpoints and events
        if (options && options.deep) {
          return BbPromise.try(function () {
              return _this.endpoints;
            })
            .each(function(endpoint) {

              return endpoint.save();
            })
            .then(function () {
              return _this.events;
            })
            .each(function(event) {
              return event.save();
            })
        }
      })
      .then(function() {

        // If templates, save templates
        if (_this.templates && Object.keys(_this.templates).length) {
          return SUtils.writeFile(path.join(_this._config.fullPath, 's-templates.json'), JSON.stringify(_this.templates, null, 2));
        }
      })
      .then(function() {

        let clone = _this.get();

        // Strip properties
        if (clone.templates) delete clone.templates;

        // Write file
        return SUtils.writeFile(path.join(_this._config.fullPath, 's-function.json'),
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

    return fs.mkdirAsync(this._config.fullPath).then(() => {
      let writeDeferred  = [],
          subFolderLevel = this._config.sPath.split('/').length - 1,
          fnRootPath   = _.repeat('../', subFolderLevel);

      writeDeferred.push(SUtils.writeFile(path.join(this._config.fullPath, 'event.json'), '{}'));

      if (this.getRuntime() === 'nodejs') {
        writeDeferred.push(
          fs.readFileAsync(path.join(this._S.config.serverlessPath, 'templates', 'nodejs', 'handler.js'))
            .then((template) => {
              let handler = _.template(template)({fnRootPath: fnRootPath});
              return SUtils.writeFile(path.join(this._config.fullPath, 'handler.js'), handler);
            })
        )
      } else if (this.getRuntime() === 'python2.7') {
        writeDeferred.push(
          fs.readFileAsync(path.join(this._S.config.serverlessPath, 'templates', 'python2.7', 'handler.py'))
          .then((template) => {
            let handler = _.template(template)({fnRootPath: fnRootPath});
            return SUtils.writeFile(path.join(this._config.fullPath, 'handler.py'), handler);
          })
        )
      }
      return BbPromise.all(writeDeferred);

    });
  }

  getRuntime() {
    let _this     = this;
    let component = _this._S.state.getComponents({ paths: [_this._config.sPath] })[0];
    if (!component) throw new SError('The component containing runtime information for this function could not be found');
    return component.runtime;
  }

  /**
   * Get Project
   * - Returns reference to the instance
   */

  getProject() {
    return this._S.state.project;
  }

  /**
   * Get Component
   * - Returns reference to the instance
   */

  getComponent() {

    let components = this._S.state.getComponents({
      paths: [this._config.sPath.split('/')[0]]
    });

    if (components.length === 1) {
      return components[0];
    }

    throw new SError('Could not find component for endpoint');
  }
}

module.exports = ServerlessFunction;
