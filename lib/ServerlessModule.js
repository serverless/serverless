'use strict';

/**
 * Serverless Module Class
 * - options.path format is: "moduleFolder"
 */

const SError           = require('./ServerlessError'),
  SUtils             = require('./utils/index'),
  ServerlessFunction = require('./ServerlessFunction'),
  extend             = require('util')._extend,
  path               = require('path'),
  _                  = require('lodash'),
  fs                 = require('fs'),
  BbPromise          = require('bluebird');

class ServerlessModule {

  /**
   * Constructor
   */

  constructor(Serverless, config) {

    // Validate required attributes
    if (!config.component || !config.module) throw new SError('Missing required config.component or config.module');

    this.S = Serverless;
    this.config = {};
    this.updateConfig(config);
    this.load();
  }

  /**
   * Update Config
   * - Takes config.sPath and parses it to the scope's config object
   */

  updateConfig(config) {
    if (config) {
      // Set sPath
      if (config.component || config.module) this.config.sPath = this.S.buildPath({
        component: config.component,
        module: config.module
      });
      // Make full path
      if (this.S.config.projectPath && this.config.sPath) {
        let parse = this.S.parsePath(this.config.sPath);
        this._fullPath = path.join(this.S.config.projectPath, parse.component, parse.module);
      }
    }
  }

  /**
   * Load
   * - Load from source (i.e., file system);
   */

  load() {

    let _this = this;

    // Defaults
    _this.data                = {};
    _this.data.name           = _this.config.module || 'module' + SUtils.generateShortId(6);
    _this.data.version        = '0.0.1';
    _this.data.profile        = 'aws-v' + require('../package.json').version;
    _this.data.location       = 'https://github.com/...';
    _this.data.author         = '';
    _this.data.description    = 'A Serverless Module';
    _this.data.runtime        = 'nodejs';
    _this.data.custom         = {};
    _this.data.functions      = {};
    _this.data.templates      = {};
    _this.data.cloudFormation = {
      resources: {},
      lambdaIamPolicyDocumentStatements: []
    };

    // If paths, check if this is on the file system
    if (!_this.S.config.projectPath ||
      !_this._fullPath ||
      !SUtils.fileExistsSync(path.join(_this._fullPath, 's-module.json'))) return;

    let moduleJson = SUtils.readAndParseJsonSync(path.join(_this._fullPath, 's-module.json'));

    // Add Functions
    moduleJson.functions  = {};
    let functionList      = fs.readdirSync(path.join(_this._fullPath, 'functions'));

    for (let i = 0; i < functionList.length; i++) {

      let func = new ServerlessFunction(_this.S, {
        module:   _this.data.module,
        function: functionList[i]
      });
      func = func.get();
      moduleJson.functions[func.name] = func;
    }

    // Get templates
    if (SUtils.fileExistsSync(path.join(_this._fullPath, 'templates', 's-templates.json'))) {
      moduleJson.templates = SUtils.readAndParseJsonSync(path.join(_this._fullPath, 'templates', 's-templates.json'));
    }

    _this.data = extend(_this.data, moduleJson);
  }

  /**
   * Get
   * - Return data
   */

  get() {
    return JSON.parse(JSON.stringify(this.data));
  }


  /**
   * getResources
   * - Get populated module resources.
   */

  getResources(options) {
    options = options || {};
    return this.getPopulate(options).cloudFormation;
  }

  /**
   * getPopulated
   * - Fill in templates then variables
   */

  getPopulated(options) {
    options = options || {};

    // Required: Stage & Region
    if (!options.stage || !options.region) throw new SError('Both "stage" and "region" params are required');

    // Required: Project Path
    if (!this.S.config.projectPath) throw new SError('Project path must be set on Serverless instance');

    // Return
    return SUtils.populate(this.S, this.get(), options.stage, options.region);
  }

  /**
   * save
   * - Saves data to file system
   */

  save(options) {

    let _this = this;

    // Validate paths
    if (!_this.S.config.projectPath ||
      !_this._fullPath) throw new SError('Missing project path or required configuration settings.');

    // Save JSON file
    fs.writeFileSync(path.join(
      _this._fullPath,
      's-module.json'),
      JSON.stringify(this.data, null, 2));

    // Save all nested data
    if (options && options.deep) {

      // Loop over functions and save
      Object.keys(_this.data.functions).forEach(function(functionName) {
        let func = new ServerlessFunction(_this.S);
        func.data = Object.create(_this.data.functions[functionName]);
        func.save();
      });
    }
  }
}

module.exports = ServerlessModule;