'use strict';

/**
 * Serverless Event Class
 */

const SError   = require('./Error'),
  SUtils       = require('./utils/index'),
  BbPromise    = require('bluebird'),
  path         = require('path'),
  fs           = require('fs'),
  _            = require('lodash');

class Event {

  /**
   * Constructor
   */

  constructor(Serverless, func, config) {

    // Validate required attributes
    if (!func)  throw new SError('Missing required function');

    // Private properties
    let _this       = this;
    _this._S        = Serverless;
    _this._config   = {};
    _this._function = func;

    _this.updateConfig(config);

    // Default properties
    _this.name   = 'event-' + SUtils.generateShortId(4);
    _this.type   = '';
    _this.config = {};
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

    // Validate: Check project is set
    if (!_this._S.hasProject()) throw new SError('Event could not be populated because no project has been set on Serverless instance');

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

module.exports = Event;