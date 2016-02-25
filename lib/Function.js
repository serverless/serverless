'use strict';

const SError            = require('./Error'),
  SUtils                = require('./utils/index'),
  SerializerFileSystem  = require('./SerializerFileSystem'),
  BbPromise             = require('bluebird'),
  async                 = require('async'),
  path                  = require('path'),
  fs                    = BbPromise.promisifyAll(require('fs')),
  _                     = require('lodash');

class Function extends SerializerFileSystem {

  constructor(S, component, data, rootPath) {
    super(S);

    // let name = _.last(rootPath.split(path.sep));

    let _this           = this;
    _this._S            = S;
    _this._config       = {};
    _this._component    = component;
    _this._rootPath     = rootPath;

    // Default properties

    _this.name          = data.name || 'function' + SUtils.generateShortId(6);
    _this.customName    = false;
    _this.customRole    = false;
    _this.handler       = './' + _this.name +'/handler.handler';
    _this.timeout       = 6;
    _this.memorySize    = 1024;
    _this.custom        = {
      excludePatterns:    [],
      envVars:            []
    };
    _this.endpoints     = [];
    _this.events        = [];
    _this.vpc           = {
      securityGroupIds:   [],
      subnetIds:          []
    };
    _this._templates = {}
    _this._templates     = new this._S.classes.Templates(this._S);
    _this._templates.setParents([component.getTemplates()])
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

    // Populate
    return SUtils.populate(this.getProject(), this.getTemplates().toObject(), this.toObject(), options.stage, options.region);
  }

  fromObject(data) {
    let _this = this;
    data.endpoints = data.endpoints || [];
    data.events = data.events || [];

    // Instantiate Endpoints
    if (data.endpoints) {
      for (let i = 0; i < data.endpoints.length; i++) {
        _this.setEndpoint(data.endpoints[i]);
      }
    }
    // Instantiate Events
    if (data.events) {
      for (let i = 0; i < data.events.length; i++) {
        _this.setEvent(data.events[i]);
      }
    }
    // Merge
    _.assign(_this, data);
    return _this;
  }

  setEndpoint(endpoint) {
    let _this = this,
      added = false;

    for (let i = 0; i < _this.endpoints.length; i++){
      let e = _this.endpoints[i];
      if (!added  && e.path == endpoint.path && e.method == endpoint.method) {
        let instance = new _this._S.classes.Endpoint(_this._S, _this);
        e = instance.fromObject(endpoint);
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
        e = instance.fromObject(event);
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

  getFilePath() {
    let args = _.toArray( arguments );
    args.unshift( this.getRootPath() );
    return path.join.apply( path, args );
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
    return this._templates || {};
  }

  setTemplate(template) {
    this._templates = template;
  }

  getRuntime() {
    return this._component.getRuntime();
  }

  getRootPath() {
    return this._rootPath
  }
}

module.exports = Function;