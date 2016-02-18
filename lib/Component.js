'use strict';

/**
 * Serverless Component Class
 */

const SError            = require('./Error'),
  SUtils                = require('./utils/index'),
  SerializerFileSystem  = require('./SerializerFileSystem'),
  BbPromise             = require('bluebird'),
  path                  = require('path'),
  _                     = require('lodash'),
  fs                    = require('fs');

class ServerlessComponent extends SerializerFileSystem {

  /**
   * Constructor
   */

  constructor(Serverless, project, config) {

    super();

    let _this       = this;
    _this._S        = Serverless;
    _this._config   = {};
    _this._project  = project;
    _this.updateConfig(config);

    // Default Properties
    _this.name           = 'component' + SUtils.generateShortId(6);
    _this.custom         = {};
    _this.runtime        = 'nodejs';
    _this._functions     = {};
    _this._templates     = {};

    _this.setRuntime( config.runtime || 'nodejs' );
  }

  /**
   * Update Config
   */

  updateConfig(config) {
    if (config) this._config = _.merge(this._config, config);
  }

  /**
   * Load
   * - Returns promise
   */

  load() {
    return this.deserializeComponent(this);
  }

  /**
   * Save
   * - Returns promise
   */

  save(options) {
    return this.serializeComponent(this, options);
  }

  get() {
    return SUtils.exportObject(_.cloneDeep(this));
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
   * toObjectPopulated
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
      clone._functions[prop] = _this._functions[prop].toObjectPopulated(options);
    }

    return clone;
  }

  /**
   * Create (scaffolding)
   * - Returns promise
   * TODO: move to serializer
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

  getFunctions() {
    return this._project;
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