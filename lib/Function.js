'use strict';

const SError            = require('./Error'),
  SerializerFileSystem  = require('./SerializerFileSystem'),
  BbPromise             = require('bluebird'),
  async                 = require('async'),
  path                  = require('path'),
  fs                    = BbPromise.promisifyAll(require('fs')),
  _                     = require('lodash');

let SUtils;

class Function extends SerializerFileSystem {

  constructor(S, component, data, config) {

    super(S);

    SUtils = S.utils;

    this._S            = S;
    this._class        = 'Function';
    this._config       = config || {};
    this._component    = component;

    this.name          = data.name || 'function' + SUtils.generateShortId(6);
    this.templates     = new this._S.classes.Templates(this._S);
    this.customName    = false;
    this.customRole    = false;
    this.handler       = './' + data.name +'/handler.handler';
    this.timeout       = 6;
    this.memorySize    = 1024;
    this.custom        = {
      excludePatterns: [],
      envVars:         []
    };
    this.endpoints     = [];
    this.events        = [];
    this.vpc           = {
      securityGroupIds: [],
      subnetIds:        []
    };
  }

  updateConfig(config) {
    this._config = _.merge(this._config, config || {});
  }

  load() {
    return this.deserialize(this);
  }

  save(options) {
    return this.serialize(this, options);
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
    // Merge
    _.assign(this, data);

    data.endpoints = data.endpoints || [];
    data.events = data.events || [];

    // Instantiate Endpoints
    if (data.endpoints) {
      for (let i = 0; i < data.endpoints.length; i++) {
        this.setEndpoint(data.endpoints[i]);
      }
    }
    // Instantiate Events
    if (data.events) {
      for (let i = 0; i < data.events.length; i++) {
        this.setEvent(data.events[i]);
      }
    }

    return this;
  }

  setEndpoint(endpoint) {
    let _this = this,
      added = false;

    for (let i = 0; i < _this.endpoints.length; i++){
      let e = _this.endpoints[i];
      if (!added  && e.path == endpoint.path && e.method == endpoint.method) {
        let instance = new _this._S.classes.Endpoint(_this._S, _this);
        _this.endpoints[i] = instance.fromObject(endpoint);
        added = true;
      }
    }

    if (!added) {
      let instance = new _this._S.classes.Endpoint(_this._S, _this);
      _this.endpoints.push(instance.fromObject(endpoint));
    }
  }

  setEvent(event) {
    let _this = this,
      added = false;

    for (let i = 0; i < _this.events.length; i++){
      let e = _this.events[i];
      if (!added  && e.name == event.name) {
        let instance = new _this._S.classes.Event(_this._S, _this);
        _this.events[i] = instance.fromObject(event);
        added = true;
      }
    }

    if (!added) {
      let instance = new _this._S.classes.Event(_this._S, _this);
      _this.events.push(instance.fromObject(event));
    }
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
      name = this.toObjectPopulated({
        stage:  options.stage,
        region: options.region }).customName;
    }

    return name;
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

  getTemplates() {
    return this.templates || {};
  }

  setTemplate(template) {
    this.templates = template;
  }

  getRuntime() {
    return this._component.getRuntime();
  }
}

module.exports = Function;