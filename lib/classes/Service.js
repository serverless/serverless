'use strict';

const SError = require('./Error');
const BbPromise = require('bluebird');
const path = require('path');
const _ = require('lodash');

class Service {

  constructor(S, data) {

    this._class = 'Service';
    this.S = S;

    // Default properties
    this.service   = null;
    this.variableSyntax = null;
    this.custom    = {};
    this.plugins   = [];
    this.functions = {};
    this.environment = {};
    this.resources = {};

    if (data) this.fromObject(data);
  }

  load() {
    let _this = this;

    const servicePath = _this.S.instances.config.servicePath;

    if (!servicePath) {
      throw new Error('ServicePath is not configured.');
    }

    return _this.S.instances.yamlParser
      .parse(path.join(servicePath, 'serverless.yaml'))
      .then((serverlessYaml) => {
        _this.service = serverlessYaml.service;
        _this.variableSyntax = serverlessYaml.variableSyntax;
        _this.custom = serverlessYaml.custom;
        _this.plugins = serverlessYaml.plugins;
        _this.resources = serverlessYaml.resources;
        _this.functions = serverlessYaml.functions;
      })
      .then(() => {
        return this.S.instances.yamlParser.parse(path.join(servicePath, 'serverless.env.yaml'));
      })
      .then((serverlessEnvYaml) => {
        _this.environment = serverlessEnvYaml;
        return BbPromise.resolve(_this);
      });
  }

  toObject() {
    return this.S.instances.utils.exportObject(_.cloneDeep(this));
  }

  toObjectPopulated(options) {
    options = options || {};
    return this.S.instances.utils.populate(this, this.toObject(), options);
  }

  fromObject(data) {
    return _.merge(this, data);
  }

  getAllFunctions() {
    return Object.keys(this.functions);
  }

  getFunction(functionName) {
    if (functionName in this.functions) {
      return this.functions[functionName];
    } else {
      throw new SError(`function ${functionName} doesn't exist in this Service`);
    }
  }

  getEventInFunction(eventName, functionName) {
    if (eventName in this.getFunction(functionName).events) {
      return this.getFunction(functionName).events[eventName];
    } else {
      throw new SError(`event ${eventName} doesn't exist in function ${functionName}`);
    }
  }

  getAllEventsInFunction(functionName) {
    return Object.keys(this.getFunction(functionName).events);
  }

  getStage(stageName) {
    if (stageName in this.environment.stages) {
      return this.environment.stages[stageName];
    } else {
      throw new SError(`stage ${stageName} doesn't exist in this Service`);
    }
  }

  getAllStages() {
    return Object.keys(this.environment.stages);
  }

  getRegionInStage(stageName, regionName) {
    if (regionName in this.getStage(stageName).regions) {
      return this.getStage(stageName).regions[regionName];
    } else {
      throw new SError(`region ${regionName} doesn't exist in stage ${stageName}`);
    }
  }

  getAllRegionsInStage(stageName) {
    return Object.keys(this.getStage(stageName).regions);
  }

  getVariables(stageName, regionName) {
    if (stageName && regionName) {
      return this.getRegionInStage(stageName, regionName).vars;
    } else if (stageName) {
      return this.getStage(stageName).vars;
    } else {
      return this.environment.vars;
    }
  }
}

module.exports = Service;
