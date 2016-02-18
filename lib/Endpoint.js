'use strict';

/**
 * Serverless Endpoint Class
 */

const SError   = require('./Error'),
  SUtils       = require('./utils/index'),
  BbPromise    = require('bluebird'),
  path         = require('path'),
  fs           = require('fs'),
  _            = require('lodash');

class Endpoint {

  /**
   * Constructor
   */

  constructor(Serverless, func, config) {

    // Validate required attributes
    if ((!config.component || !config.module || !config.function || !config.endpointPath || !config.endpointMethod) && !config.sPath)  throw new SError('Missing required config.sPath');

    // Private properties
    let _this       = this;
    _this._S        = Serverless;
    _this._function = func;

    _this.updateConfig(config);

    // Default properties
    _this.path                 = _this.getComponent().getName() + '/' + _this.getFunction().getName();
    _this.method               = 'GET';
    _this.type                 = 'AWS';
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
   */

  updateConfig(config) {
    this._config = _.merge(this._config, config || {});
  }

  /**
   * Set
   */

  set(data) {
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
    return SUtils.populate(_this._S.state.getMeta(), _this.getTemplates(), _this.get(), options.stage, options.region);
  }

  getProject() {
    return this.getComponent().getProject();
  }

  getComponent() {
    return this.getFunction().getComponent();
  }

  getFunction() {
    return this._function;
  }

  getTemplates() {
    return this.getFunction().getTemplates();
  }
}

module.exports = Endpoint;