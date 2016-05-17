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
    this.custom    = {};
    this.plugins   = [];
    this.functions = {};
    this.environment = {};
    this.resources = {
      aws: {},
      azure: {},
      google: {}
    };

    if (data) this.fromObject(data);
  }

  load() {
    let _this = this;

    const servicePath = _this.S.instances.config.servicePath;

    if (!servicePath) throw SError('ServicePath is not configured.');

    return _this.S.instances.yamlParser
      .parse(path.join(servicePath, 'serverless.yaml'))
      .then((serverlessYaml) => {
        _this.service = serverlessYaml.service;
        _this.custom = serverlessYaml.custom;
        _this.plugins = serverlessYaml.plugins;

        // load any defined resources based on provider
        if (serverlessYaml.resources.aws) {
          _this.resources.aws = serverlessYaml.resources.aws;
        }
        if (serverlessYaml.resources.azure) {
          _this.resources.azure = serverlessYaml.resources.azure;
        }
        if (serverlessYaml.resources.google) {
          _this.resources.google = serverlessYaml.resources.google;
        }

        // load functions

      })
      .then(() => {
        return this.S.instances.yamlParser.parse(path.join(servicePath, 'serverless.env.yaml'));
      })
      .then((serverlessEnvYaml) => {
        _this.environment = serverlessEnvYaml;
        return BbPromise.resolve(_this);
      });
  }

  save() {

  }

  toObject() {
    return this.S.instances.utils.exportObject(_.cloneDeep(this));
  }

  toObjectPopulated(options) {

  }

  fromObject(data) {
    return _.merge(this, data);
  }

  getAllFunctions() {

  }

  getFunction(functionName) {

  }

  getEventInFunction(eventName) {

  }

  getAllEventsInFunction() {

  }

  setEvent(eventName, functionName) {

  }

  getResources(provider) {
    this.S.instances.utils.validateProviders(provider);
    return this.resources[provider];
  }

  getStage(stageName) {

  }

  getAllStages() {

  }

  getRegionInStage(stageName, regionName) {

  }

  getAllRegionsInStage(stageName) {

  }

  getVariables(stageName, regionName) {

  }

}

module.exports = Service;
