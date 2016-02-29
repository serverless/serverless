'use strict';

const SError            = require('./Error'),
  SerializerFileSystem  = require('./SerializerFileSystem'),
  BbPromise             = require('bluebird'),
  path                  = require('path'),
  fs                    = require('fs'),
  _                     = require('lodash');

let SUtils;

class Endpoint extends SerializerFileSystem {

  constructor(S, func) {

    super(S);

    SUtils = S.utils;

    // Validate required attributes
    if (!func)  throw new SError('Missing required function');

    // Private properties
    let _this       = this;
    _this._S        = S;
    _this._class    = 'Endpoint';
    _this._function = func;

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

module.exports = Endpoint;