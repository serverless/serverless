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

  constructor(Serverless, component, config) {
    // Validate required attributes
    if ((!config.component || !config.module || !config.function) && !config.sPath) throw new SError('Missing required config.sPath');

    let _this           = this;
    _this._S            = Serverless;
    _this._config       = {};
    _this._component    = component;
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
    _this.endpoints.push(new _this._S.classes.Endpoint(_this._S, _this, {
      sPath:  _this._config.sPath +
      '@' +
      _this._config.sPath.split('/').splice(1, _this._config.sPath.split('/').length).join('/')
      + '~GET'
    }));
    _this.vpc           = {
      securityGroupIds: [],
      subnetIds: []
    };
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

      let instance      = new _this._S.classes.Endpoint(_this._S, _this, {
        sPath:           _this._config.sPath +  '@' + data.endpoints[i].path + '~' + data.endpoints[i].method
      });
      data.endpoints[i] = instance.set(data.endpoints[i]);
    }

    // Instantiate Events
    for (let i = 0; i < data.events.length; i++) {
      let instance      = new _this._S.classes.Event(_this._S, _this, {
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
    if (this._S.hasProject() && this._config.sPath) {
      this._config.fullPath = this._S.getProject().getFilePath( this._config.sPath.split('/').join(path.sep) );
    }
  }

  getSPath() {
    return this._config.sPath;
  }

  getFullPath() {
    return this._config.fullPath;
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
        if (!_this._S.hasProject()) throw new SError('Function could not be loaded because no project path has been set on Serverless instance');

        // Validate: Check function exists
        if (!SUtils.fileExistsSync(path.join(_this._config.fullPath, 's-function.json'))) {
          throw new SError('Function could not be loaded because it does not exist in your project: ' + _this._config.sPath);
        }

        functionJson = SUtils.readAndParseJsonSync(path.join(_this._config.fullPath, 's-function.json'));
        return functionJson.endpoints ? functionJson.endpoints : [];
      })
      .each(function(e, i) {

        // Add Endpoint Class Instances
        functionJson.endpoints[i] = new _this._S.classes.Endpoint(_this._S, _this, {
          sPath:  _this._config.sPath +  '@' + e.path + '~' + e.method
        });

        functionJson.endpoints[i].set( e );
      })
      .then(function() {
        return functionJson.events ? functionJson.events : [];
      })
      .each(function(e, i) {

        // Add Endpoint Class Instances
        functionJson.events[i] = new _this._S.classes.Event(_this._S, _this, {
          sPath:  _this._config.sPath +  '#' + e.name
        });

        functionJson.events[i].set( e );
      })
      .then(function() {
        let templates = [];
        let p = _this.getFullPath();

        while( !_this._S.classes.Component.isComponentDir( p ) ) {
          if( SUtils.fileExistsSync(path.join(p, 's-templates.json'))) {
            templates.unshift( require(path.join(p, 's-templates.json')) );
          }
          p = path.join( p, '..' );
        }

        functionJson.templates = _.merge.apply( _, templates );
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

    let name = this.getProject().getName() + '-' + this.getComponent().name;

    // Backwards Compatibility Support
    // TODO: Remove in V1 because will result in breaking change
    if (this._config.sPath.split('/').length == 3) {

      // Check if s-module.json exists in subfolder
      if (SUtils.fileExistsSync(this._S.getProject().getFilePath(
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
    if (!_this._S.hasProject()) throw new SError('Function could not be populated because no project path has been set on Serverless instance');

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
      if (!_this._S.hasProject()) throw new SError('Function could not be saved because no project path has been set on Serverless instance');

      // Create if does not exist
      if (!SUtils.fileExistsSync(path.join(_this._config.fullPath, 's-function.json'))) {
        return _this._create();
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
      let subFolderLevel = this._config.sPath.split('/').length - 1,
          fnRootPath   = _.repeat('../', subFolderLevel);

      return BbPromise.all([
        SUtils.writeFile(path.join(this._config.fullPath, 'event.json'), '{}'),
        this.getRuntime().populateFunctionFolder( fnRootPath, this._config.fullPath )
      ]);
    });
  }

  getRuntime() {
    return this._component.getRuntime();
  }

  getName() {
    return this.name;
  }

  getAllEvents() {
    return this.events;
  }

  getAllEndpoints() {
    return this.endpoints;
  }

  /**
   * Get Project
   * - Returns reference to the instance
   */

  getProject() {
    return this._S.getProject();
  }

  /**
   * Get Component
   * - Returns reference to the instance
   */

  getComponent() {
    return this._component;
  }

  static isFunctionDir( dir ) {
    return SUtils.fileExistsSync(path.join(dir, 's-function.json'));
  }

  getCFSnippets() {
    let cfSnippets = [];

    // Add s-resources-cf.json extensions
    if (SUtils.fileExistsSync(path.join(this.getFullPath(), 's-resources-cf.json'))) {
      let resourcesExtension = SUtils.readAndParseJsonSync(this.getFullPath(), 's-resources-cf.json');
      cfSnippets.push(resourcesExtension);
    }

    // Backward compat support for this.cloudFormation and s-module.json
    // TODO: Remove @ V1 when we can make breaking changes
    if (SUtils.fileExistsSync(path.join(this.getFullPath(), '..', 's-module.json'))) {
      let moduleJson = SUtils.readAndParseJsonSync(path.join(this.getFullPath(), '..', 's-module.json'));
      if (moduleJson.cloudFormation) cfSnippets.push(moduleJson.cloudFormation);
    }

    return cfSnippets;
  }
}

module.exports = ServerlessFunction;
