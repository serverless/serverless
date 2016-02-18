'use strict';

/**
 * Serverless Function Class
 * - config.sPath is required
 * - config.component, config.module, config.function will be DEPRECATED soon.  Do not use!
 */

const SError   = require('./Error'),
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

    let _this           = this;
    _this._S            = Serverless;
    _this._config       = {};
    _this._component    = component;

    _this.updateConfig(config);

    // Default properties
    _this.name          = _this._config.function || 'function' + SUtils.generateShortId(6);
    _this.customName    = false;
    _this.customRole    = false;
    _this.handler       = './' + _this.name +'/handler.handler';
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
   * Update Config
   */

  updateConfig(config) {
    this._config = _.merge(this._config, config || {});
  }

  /**
   * Load
   * - Returns Promise
   */

  load() {
    return this.deserializeFunction(this);
  }

  /**
   * Save
   * - Returns promise
   */

  save() {
    return this.serializeFunction(this);
  }

  /**
   * Set
   */

  set(data) {

    let _this = this;
    data.endpoints = data.endpoints || [];
    data.events = data.events || [];

    // Instantiate Endpoints
    if (data.endpoints) {
      for (let i = 0; i < data.endpoints.length; i++) {
        let instance = new _this._S.classes.Endpoint(_this._S, _this);
        instance.set(data.endpoints[i]);
        data.endpoints[i] = instance.set(data.endpoints[i]);
      }
    }
    // Instantiate Events
    for (let i = 0; i < data.events.length; i++) {
      let instance      = new _this._S.classes.Event(_this._S, _this);
      instance.set(data.events[i]);
      data.events[i] = instance.set(data.events[i]);
    }
    // Merge
    _.assign(_this, data);
    return _this;
  }

  /**
   * Get
   */

  get() {
    let clone  = _.cloneDeep(this);
    for (let i = 0; i < this.endpoints.length; i++) {
      clone.endpoints[i] = this.endpoints[i].toJson();
    }
    for (let i = 0; i < this.events.length; i++) {
      clone.events[i] = this.events[i].toJson();
    }
    return SUtils.exportClassData(clone);
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
    return SUtils.populate(_this._S.state.getMeta(), _this.getTemplates(), _this.get(), options.stage, options.region);
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

  getTemplates() {
    return this._templates;
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

  getProject() {
    return this._S.getProject();
  }

  getComponent() {
    return this._component;
  }
}

module.exports = ServerlessFunction;
