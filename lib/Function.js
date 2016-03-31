'use strict';

const SError              = require('./Error'),
    BbPromise             = require('bluebird'),
    async                 = require('async'),
    path                  = require('path'),
    fs                    = BbPromise.promisifyAll(require('fs')),
    _                     = require('lodash');

module.exports = function(S) {

  class Function extends S.classes.Serializer {

    constructor(data, filePath) {

      super();

      this._class = 'Function';
      this._config = config || {};
      this._filePath = filePath;

      this.name = data.name || 'function' + S.utils.generateShortId(6);
      this.setRuntime(data.runtime || 'nodejs');
      this.description = 'Serverless Lambda function for project: ' + this.getProject().getName();
      this.customName = false;
      this.customRole = false;
      this.handler = 'handler.handler';
      this.timeout = 6;
      this.memorySize = 1024;
      this.authorizer = {};
      this.custom = {
        excludePatterns: []
      };
      this.endpoints = [];
      this.events = [];
      this.environment = {
        SERVERLESS_PROJECT: "${project}",
        SERVERLESS_STAGE:   "${stage}",
        SERVERLESS_REGION:  "${region}"
      };
      this.vpc = {
        securityGroupIds: [],
        subnetIds: []
      };

      this.templates = new S.classes.Templates({}, this.getRootPath('s-templates.json'));

      if (data) this.fromObject(data);
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
      return S.utils.exportObject(_.cloneDeep(this));
    }

    toObjectPopulated(options) {
      options = options || {};

      // Validate: Check project path is set
      if (!S.hasProject()) throw new SError('Function could not be populated because no project path has been set on Serverless instance');

      // Merge templates
      let templates = _.merge(
        this.getProject().getTemplates().toObject(),
        this.getTemplates().toObject());

      // Populate
      return S.utils.populate(this.getProject(), templates, this.toObject(), options.stage, options.region);
    }

    fromObject(data) {

      // Clear Data
      this.endpoints = [];
      this.events = [];

      if (data.runtime) {
        this.setRuntime(data.runtime);
        delete data.runtime;
      }

      if (data.endpoints) {
        for (let i = 0; i < data.endpoints.length; i++) {
          this.setEndpoint(new S.classes.Endpoint(data.endpoints[i], this));
        }
        delete data.endpoints;
      }
      if (data.events) {
        for (let i = 0; i < data.events.length; i++) {
          this.setEvent(new S.classes.Event(data.events[i], this));
        }
        delete data.events;
      }
      if (data.templates) {
        this.templates.fromObject(data.templates);
        delete data.templates;
      }

      _.assign(this, data);
      return this;
    }

    setEndpoint(endpoint) {
      let _this = this,
        added = false;

      for (let i = 0; i < _this.endpoints.length; i++) {
        let e = _this.endpoints[i];
        if (!added && e.path == endpoint.path && e.method == endpoint.method) {
          let instance = new S.classes.Endpoint({}, _this);
          _this.endpoints[i] = instance.fromObject(endpoint);
          added = true;
        }
      }

      if (!added) {
        let instance = new S.classes.Endpoint({}, _this);
        _this.endpoints.push(instance.fromObject(endpoint));
      }
    }

    setEvent(event) {
      let _this = this,
        added = false;

      for (let i = 0; i < _this.events.length; i++) {
        let e = _this.events[i];
        if (!added && e.name == event.name) {
          let instance = new S.classes.Event({}, _this);
          _this.events[i] = instance.fromObject(event);
          added = true;
        }
      }

      if (!added) {
        let instance = new S.classes.Event({}, _this);
        _this.events.push(instance.fromObject(event));
      }
    }

    setRuntime(runtimeName) {
      if (S.getRuntime(runtimeName)) {
        this.runtime = runtimeName;
      } else {
        throw new SError(`Runtime ${runtimeName} is not supported!`);
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

      // Add function name
      let name = this.getProject().getName() + '-' + this.name;

      // If customName, use that
      if (options.stage && options.region && this.customName) {
        name = this.toObjectPopulated({
          stage: options.stage,
          region: options.region
        }).customName;
      }

      return name;
    }

    getName() {
      return this.name;
    }

    getHandler() {
      return this.getRuntime().getHandler(this);
    }

    getAllEvents() {
      return this.events;
    }

    getAllEndpoints() {
      return this.endpoints;
    }

    getProject() {
      return S.getProject();
    }

    getTemplates() {
      return this.templates || {};
    }

    setTemplate(template) {
      this.templates = template;
    }

    getRuntime() {
      return S.getRuntime(this.runtime);
    }

    getFilePath() {
      return this._filePath;
    }

    getRootPath() {
      let args = _.toArray(arguments);
      args.unshift(path.dirname(this.getFilePath()));
      return path.join.apply(path, args);
    }

    static validateName(name) {
      return /^[a-zA-Z0-9-_]+$/.test(name);
    }

    scaffold() {
      return this.getRuntime().scaffold(this);
    }

    run(stage, region, event) {
      return this.getRuntime().run(this, stage, region, event);
    }

    build(pathDist, stage, region) {
      return this.getRuntime().build(this, pathDist, stage, region);
    }
  }

  return Function;

};