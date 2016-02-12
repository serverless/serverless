'use strict';

/**
 * Serverless Endpoint Class
 * - options.path format is: "component/functionParentFolders(ifAny)/functionFolder@endpointPath~endpointMethod
 */

const SError   = require('./ServerlessError'),
  SUtils       = require('./utils/index'),
  BbPromise    = require('bluebird'),
  path         = require('path'),
  fs           = require('fs'),
  _            = require('lodash');

class ServerlessEndpoint {

  /**
   * Constructor
   */

  constructor(Serverless, func, config) {

    // Validate required attributes
    if ((!config.component || !config.module || !config.function || !config.endpointPath || !config.endpointMethod) && !config.sPath)  throw new SError('Missing required config.sPath');

    // Private properties
    let _this     = this;
    _this._S      = Serverless;
    _this._config = {
      sPath: undefined,
      fullPath: undefined
    };
    _this._function = func;
    _this.updateConfig(config);

    // Default properties
    _this.path                 = _this._config.sPath.split('@')[1].split('~')[0];
    _this.method               = _this._config.sPath.split('~')[1].toUpperCase();
    _this.type                 = _this._config.type || 'AWS';
    _this.authorizationType    = 'none';
    _this.apiKeyRequired       = false;
    _this.requestParameters    = {};
    _this.requestTemplates     = {};
    _this.requestTemplates['application/json'] = '';
    _this.responses            = {};
    _this.responses['default'] = {
      statusCode: '200',
      responseParameters: {},
      responseModels: {},
      responseTemplates: {}
    };
    _this.responses['default']['responseTemplates']['application/json'] = '';
    _this.responses['400']     = {
      statusCode: '400'
    };
  }

  /**
   * Update Config
   * - Takes config.component, config.module, config.function
   */

  updateConfig(config) {

    if (!config) return;

    // Set sPath
    if (config.component && config.module && config.function && config.endpointPath && config.endpointMethod) {
      this._config.sPath = config.component + '/' + config.module + '/' + config.function + '@' + config.endpointPath + '~' + config.endpointMethod;
    }
    if (config.sPath) {
      this._config.sPath = config.sPath;
    }

    // Make full path
    if (this._S.hasProject() && this._config.sPath) {
      this._config.fullPath = this.getProject().getFilePath( this._config.sPath.split('@')[0].split('/').join(path.sep) );
    }
  }

  /**
   * Set
   * - Set data
   * - Accepts a data object
   */

  set(data) {
    // Merge
    _.assign(this, data);
    return this;
  }

  /**
   * Get
   * - Return data
   */

  get() {
    return SUtils.exportClassData(_.cloneDeep(this));
  }

  /**
   * Get Populated
   * - Fill in templates then variables
   * - Returns Promise
   */

  getPopulated(options) {

    let _this = this;

    options = options || {};

    // Validate: Check Stage & Region
    if (!options.stage || !options.region) throw new SError('Both "stage" and "region" params are required');

    // Validate: Check project path is set
    if (!_this._S.hasProject()) throw new SError('Endpoint could not be populated because no project path has been set on Serverless instance');

    // Populate
    let clone               = _this.get();
    clone  = SUtils.populate(_this._S.state.getMeta(), _this.getTemplates(), clone, options.stage, options.region);
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
      this.getFunction().getTemplates()
    );
  }

  /**
   * Get Project
   * - Returns reference to the instance
   */

  getProject() {
    return this.getComponent().getProject();
  }

  getSPath() {
    return this._config.sPath;
  }

  getFullPath() {
    return this._config.fullPath;
  }

  /**
   * Get Component
   * - Returns reference to the instance
   */

  getComponent() {
    return this.getFunction().getComponent();
  }

  /**
   * Get Function
   * - Returns reference to the instance
   */

  getFunction() {
    return this._function;
  }
}

module.exports = ServerlessEndpoint;
