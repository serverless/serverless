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
    this.S = Serverless;
    this.updateConfig(config || {});
    this.load();
  }

  /**
   * Update Config
   * - Takes config.sPath and parses it to the scope's config object
   */

  updateConfig(config) {
    if (config) {
      this.config = extend(this.config, config);
      if (this.config.sPath) {
        this.S.validatePath(this.config.sPath, 'component');
        // Always parse sPath
        this.config = extend(this.config, this.S.parsePath(this.config.sPath));
      }
      // Add full path
      this.config.fullPath = this.config.fullPath ? this.config.fullPath : path.join(this.S.config.projectPath, this.config.component);
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
    _this.data.name           = 'module' + SUtils.generateShortId(6);
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

    if (_this.config.fullPath) {
      let modulePath = path.join(_this.S.config.projectPath, _this.config.component, _this.config.module)
    }

    // If paths, check if this is on the file system
    if (!_this.S.config.projectPath ||
      !_this.config.fullPath ||
      !SUtils.fileExistsSync(path.join(_this.config.fullPath, 's-module.json'))) return;

    let moduleJson = SUtils.readAndParseJsonSync(path.join(_this.options.modulePath, 's-module.json'));

    // Add Functions
    moduleJson.functions  = {};
    let functionList      = fs.readdirSync(path.join(modulePath, 'functions'));

    for (let i = 0; i < functionList.length; i++) {

      let func = new ServerlessFunction(_this.S, {
        module:   _this.options.module,
        function: functionList[i]
      });
      func = func.get();
      moduleJson.functions[func.name] = func;
    }

    // Get templates
    if (SUtils.fileExistsSync(path.join(_this.options.modulePath, 'templates', 's-templates.json'))) {
      moduleJson.templates = SUtils.readAndParseJsonSync(path.join(_this.options.modulePath, 'templates', 's-templates.json'));
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

  save() {

    let _this = this;

    // Validate path
    if (!_this.config.sPath) throw new SError('A Serverless path must be set to save to a location');

    // loop over functions and save
    Object.keys(_this.data.functions).forEach(function(functionName) {

      let func = new ServerlessFunction(_this.S);
      func.data = Object.create(_this.data.functions[functionName]);
      func.save();
    });

    let functionsTemp = false;

    // If file exists, do a diff and skip if equal
    if (SUtils.fileExistsSync(path.join(_this.options.modulePath, 's-module.json'))) {

      let moduleJson = SUtils.readAndParseJsonSync(path.join(_this.options.modulePath, 's-module.json'));

      // clone functions temporarily
      functionsTemp = Object.create(this.data.functions);

      // temporarily delete functions to compare with JSON
      delete this.data['functions'];

      // check if data changed
      if (_.isEqual(moduleJson, this.data)) {

        // clone back functions property that we deleted
        this.data.functions = Object.create(functionsTemp);
        return;
      }
    }

    // overwrite modules JSON file
    fs.writeFileSync(path.join(_this.options.modulePath, 's-module.json'),
      JSON.stringify(this.data, null, 2));

    if (functionsTemp) this.data.functions = Object.create(functionsTemp);

  }
}

module.exports = ServerlessModule;