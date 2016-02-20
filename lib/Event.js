'use strict';

const SError            = require('./Error'),
  SUtils                = require('./utils/index'),
  SerializerFileSystem  = require('./SerializerFileSystem'),
  BbPromise             = require('bluebird'),
  path                  = require('path'),
  fs                    = require('fs'),
  _                     = require('lodash');

class Event extends SerializerFileSystem {

  constructor(Serverless, func, config) {

    super(S);

    // Validate required attributes
    if (!func)  throw new SError('Missing required function');

    // Private properties
    let _this       = this;
    _this._S        = Serverless;
    _this._class    = 'Error';
    _this._config   = {};
    _this._function = func;

    _this.updateConfig(config);

    // Default properties
    _this.name   = 'event-' + SUtils.generateShortId(4);
    _this.type   = '';
    _this.config = {};
  }

  updateConfig(config) {
    this._config = _.merge(this._config, config || {});
  }

  toObject() {
    return SUtils.exportObject(_.cloneDeep(this));
  }

  toObjectPopulated(options) {
    options = options || {};

    // Validate: Check Stage & Region
    if (!options.stage || !options.region) throw new SError('Both "stage" and "region" params are required');

    // Validate: Check project path is set
    if (!this._S.hasProject()) throw new SError('Function could not be populated because no project path has been set on Serverless instance');

    // Populate
    return SUtils.populate(this.getVariables(), this.getTemplates(), this.toObject(), options.stage, options.region);
  }

  fromObject(data) {
    return _.assign(this, data);
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

  getVariables() {
    return this.getFunction().getVariables();
  }
}

module.exports = Event;