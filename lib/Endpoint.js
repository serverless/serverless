'use strict';

const SError            = require('./Error'),
    SerializerFileSystem  = require('./SerializerFileSystem'),
    BbPromise             = require('bluebird'),
    path                  = require('path'),
    fs                    = require('fs'),
    _                     = require('lodash');

let SUtils;

class Endpoint extends SerializerFileSystem {

  constructor(S, func, data) {

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
    _this.path                 = _this.getFunction().getName();
    _this.method               = 'GET';
    _this.type                 = 'AWS';
    _this.authorizationType    = 'none';
    _this.authorizerId         = false;
    _this.customAuthorizer     = false;
    _this.apiKeyRequired       = false;
    _this.requestParameters    = {};
    _this.requestTemplates     = {};
    _this.requestTemplates['application/json'] = '';
    _this.responses            = {};
    _this.responses['default'] = {
      statusCode:                '200',
      responseParameters:        {},
      responseModels:            {},
      responseTemplates:         {}
    };
    _this.responses['default']['responseTemplates']['application/json'] = '';
    _this.responses['400']     = {
      statusCode:                '400'
    };

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
        this.getTemplates().toObject());

    // Populate
    return SUtils.populate(this.getProject(), templates, this.toObject(), options.stage, options.region);
  }

  fromObject(data) {
    return _.assign(this, data);
  }

  getName() {
    return this.path + '~' + this.method;
  }

  getProject() {
    return this._S.getProject();
  }

  getFunction() {
    return this._function;
  }

  getTemplates() {
    return this.getFunction().getTemplates();
  }

}

module.exports = Endpoint;