'use strict';

/**
 * Serverless Component Class
 */

const SError       = require('./Error'),
  SUtils           = require('./utils/index'),
  BbPromise        = require('bluebird'),
  path             = require('path'),
  _                = require('lodash'),
  fs               = require('fs');

class ServerlessComponent {

  /**
   * Constructor
   */

  constructor(Serverless, project, config) {

    let _this       = this;
    _this._S        = Serverless;
    _this._config   = {};
    _this._project  = project;
    _this.updateConfig(config);

    // Default Properties
    _this.name           = 'component' + SUtils.generateShortId(6);
    _this.custom         = {};
    _this._functions     = {};
    _this._templates     = {};

    _this.setRuntime( config.runtime || 'nodejs' );
  }

  getName(){
    return this.name;
  }

  getRuntime() {
    return this._runtime;
  }

  setRuntime( runtimeName ) {
    let runtime = SUtils.supportedRuntimes[ runtimeName ];

    if( runtime ) {
      // TODO: get rid of that set()/get()/_.assign/_.cloneDeep so this can be cleaner
      this.runtime = runtimeName;
      this._runtime = new runtime( this._S );
    } else {
      throw new SError( `Runtime ${runtimeName} is not supported!` );
    }
  }

  getAllFunctions() {
    return _.values( this._functions );
  }

  setFunction( func ){
    this._functions[ func.getSPath() ] = func;
  }

  /**
   * Update Config
   * - Takes config.component
   */

  updateConfig(config) {

    if (!config) return;

    // Temp fix to support config.component
    if (config.component && !config.sPath) config.sPath = config.component;

    // Set sPath
    if (config.sPath) {
      this._config.sPath     = config.sPath;
    }

    // Make full path
    if (this._S.hasProject() && this._config.sPath) {
      this._config.fullPath = this.getProject().getFilePath(this._config.sPath);
    }
  }

  /**
   * Load
   * - Load from source (i.e., file system);
   * - Returns promise
   */

  load() {
    return this.deserializeComponent(this);
  }

  /**
   * Set
   * - Set data
   * - Accepts a data object
   */

  set(data) {
    let _this = this;

    // Instantiate Components
    for (let prop in data._functions) {

      let instance = new _this._S.classes.Function(_this._S, _this, {
        sPath: prop
      });
      data._functions[prop] = instance.set(data._functions[prop]);
    }

    // Merge in
    _this.setRuntime( data.runtime );
    delete data.runtime;

    _this = _.extend(_this, data);
    return _this;
  }

  /**
   * Get
   * - Returns clone of data
   */

  get() {
    let clone = _.cloneDeep(this);
    for (let prop in this._functions) {
      clone._functions[prop] = this._functions[prop].get();
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
    if (!_this._S.hasProject()) throw new SError('Component could not be populated because no project path has been set on Serverless instance');

    // Populate
    let clone            = _this.get();
    clone                = SUtils.populate(_this._S.state.getMeta(), this.getTemplates(), clone, options.stage, options.region);
    clone._functions        = {};
    for (let prop in _this._functions) {
      clone._functions[prop] = _this._functions[prop].getPopulated(options);
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
      _.cloneDeep(this._templates)
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
      if (!_this._S.hasProject()) throw new SError('Component could not be saved because no project path has been set on Serverless instance');

      // Create if does not exist
      if (!SUtils.fileExistsSync(path.join(_this._config.fullPath, 's-component.json'))) {
        return _this._create();
      }
    })
      .then(function() {

        // Save all nested functions
        if (options && options.deep) {
          return BbPromise.try(function () {
              return Object.keys(_this._functions);
            })
            .each(function(fnKey) {
              return _this._functions[fnKey].save();
            })
        }
      })
      .then(function() {

        // If templates, save templates
        if (_this._templates && Object.keys(_this._templates).length) {
          return SUtils.writeFile(path.join(_this._config.fullPath, 's-templates.json'), JSON.stringify(_this._templates, null, 2));
        }
      })
      .then(function() {

        let clone = _this.get();

        // Strip properties
        if (clone._functions) delete clone._functions;
        if (clone._templates) delete clone._templates;

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
    let _this              = this;

    return BbPromise.try(function() {
      fs.mkdirSync(_this._config.fullPath);
      fs.mkdirSync(path.join(_this._config.fullPath, 'lib'));

      return( _this.getRuntime().populateComponentFolder( _this._config.fullPath ) );
    });
  }

  /**
   * Get Project
   * - Returns reference to the instance
   */

  getProject() {
    return this._project;
  }

  getSPath() {
    return this._config.sPath;
  }

  getFullPath() {
    return this._config.fullPath;
  }

  static isComponentDir( dir ) {
    return SUtils.fileExistsSync(path.join(dir, 's-component.json'));
  }

  // TODO: this should be aws-provider specific (provider.loadComponent() + provider.loadFunction() should do this)
  getCFSnippets() {
    let cfSnippets = _.map( this.getAllFunctions(), f => f.getCFSnippets() );

    // Check component root for s-resources.json extensions
    if (SUtils.fileExistsSync(path.join(this.getFullPath(), 's-resources-cf.json'))) {
      let resourcesExtension = SUtils.readAndParseJsonSync(path.join(this.getFullPath(), 's-resources-cf.json'));
      cfSnippets.push(resourcesExtension);
    }

    return cfSnippets;
  }
}

module.exports = ServerlessComponent;