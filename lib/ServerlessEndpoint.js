'use strict';

/**
 * Serverless Endpoint Class
 * - options.path format is: "moduleFolder/functionFolder#functionName"
 */

const SError   = require('./ServerlessError'),
  SUtils       = require('./utils/index'),
  path         = require('path'),
  fs           = require('fs'),
  _            = require('lodash');

class ServerlessEndpoint {

  /**
   * Constructor
   */

  constructor(Serverless, config) {

    // Validate required attributes
    if (!config.component || !config.module || !config.function || !config.endpoint) throw new SError('Missing required config.component, config.module, config.function or config.endpoint');

    // Private properties
    let _this    = this;
    _this._S      = Serverless;
    _this._config = {};
    _this.updateConfig(config);

    // Default properties
    _this.path                 = _this._config.module + '/' + _this._config.function;
    _this.method               = 'GET';
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
    _this.responses['default']['application/json'] = '';
    _this.responses['400']     = {
      statusCode: '400'
    };
  }

  /**
   * Update Config
   * - Takes config.component, config.module, config.function
   */

  updateConfig(config) {

    if (!config) return;

    // Set sPath
    if (config.component || config.module || config.function || config.endpoint) {
      this._config.component     = config.component;
      this._config.module        = config.module;
      this._config.function      = config.function;
      this._config.endpoint      = config.endpoint;
      this._config.endpointPath  = config.endpoint.replace('@','').split('~')[0];
      this._config.endpointUrl   = config.endpoint.split('~')[1];
      this._config.sPath         = this._S.buildPath({
        component: config.component,
        module:    config.module,
        function:  config.function,
        endpoint:  config.endpoint
      });
    }

    // Make full path
    if (this._S.config.projectPath && this._config.sPath) {
      let parse            = this._S.parsePath(this._config.sPath);
      this._config.fullPath = path.join(this._S.config.projectPath, parse.component, parse.module, parse.function);
    }
  }

  /**
   * Load
   * - Load from source (i.e., file system);
   */

  load() {

    let _this = this;

    // Validate: Check project path is set
    if (!this._S.config.projectPath) throw new SError('Endpoint could not be loaded because no project path has been set on Serverless instance');

    // Validate: Check function exists
    if (!SUtils.fileExistsSync(path.join(_this._config.fullPath, 's-function.json'))) {
      throw new SError('Endpoint could not be loaded because it does not exist in your project: ' + _this._config.sPath);
    }

    let functionJson = SUtils.readAndParseJsonSync(path.join(_this._config.fullPath, 's-function.json'));
    let endpoint     = null;
    for (let i = 0; i < functionJson.endpoints.length; i++) {
      if (functionJson.endpoints[i].path === _this._config.endpointPath &&
        functionJson.endpoints[i].method === _this._config.endpointMethd) {
        endpoint = functionJson.endpoints[i];
      }
    }

    if (!endpoint) throw new SError('Endpoint was not found: ' + _this._config.sPath);

    _this.data = endpoint;
  }

  /**
   * Get
   * - Return data
   */

  get() {
    return _.cloneDeep(this.data);
  }

  /**
   * getPopulated
   * - Fill in templates then variables
   */

  getPopulated(options) {

    options = options || {};

    // Validate: Check Stage & Region
    if (!options.stage || !options.region) throw new SError('Both "stage" and "region" params are required');

    // Validate: Check project path is set
    if (!this._S.config.projectPath) throw new SError('Endpoint could not be populated because no project path has been set on Serverless instance');

    // Return
    return SUtils.populate(this._S, this.get(), options.stage, options.region);
  }

  /**
   * save
   * - Saves data to file system
   */

  save() {

    let _this = this;

    // Validate: Check project path is set
    if (!this._S.config.projectPath) throw new SError('Endpoint could not be saved because no project path has been set on Serverless instance');

    // Check if endpoint exists, and replace it if so
    let functionJson = SUtils.readAndParseJsonSync(path.join(_this._config.fullPath, 's-function.json'));
    let endpoint     = null;
    for (let i = 0; i < functionJson.endpoints.length; i++) {
      if (functionJson.endpoints[i].path === _this._config.endpointPath &&
        functionJson.endpoints[i].method === _this._config.endpointMethd) {
        endpoint                  = functionJson.endpoints[i];
        functionJson.endpoints[i] = _this.data;
      }
    }

    if (!endpoint) functionJson.endpoints.push(_this.data);

    // Save JSON file
    fs.writeFileSync(path.join(
      _this._config.fullPath,
      's-function.json'),
      JSON.stringify(data, null, 2));
  }
}

module.exports = ServerlessEndpoint;