'use strict';

const SError            = require('./Error'),
  SerializerFileSystem  = require('./SerializerFileSystem'),
  BbPromise             = require('bluebird'),
  path                  = require('path'),
  fs                    = require('fs'),
  _                     = require('lodash');

let SUtils;

class Event extends SerializerFileSystem {

  constructor(S, func, data) {

    super(S);

    SUtils = S.utils;

    // Validate required attributes
    if (!func)  throw new SError('Missing required function');

    // Private properties
    let _this       = this;
    _this._S        = S;
    _this._class    = 'Error';
    _this._function = func;

    // Default properties
    _this.name   = 'mySchedule';
    _this.type   = 'schedule';
    _this.config   = {};
    _this.config.schedule = 'rate(5 minutes)';

    if (data) _this.fromObject(data);
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

    // Merge templates
    let templates = _.merge(
      this.getProject().getTemplates().toObject(),
      this.getComponent().getTemplates().toObject(),
      this.getTemplates().toObject());

    // Populate
    return SUtils.populate(this.getProject(), templates, this.toObject(), options.stage, options.region);
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

}

module.exports = Event;