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
    fs                 = require('fs'),
    BbPromise          = require('bluebird');

class ServerlessModule {

  /**
   * Constructor
   */

  constructor(Serverless, options) {
    this.S       = Serverless;
    this.options = options || {};
    this.load(options);
  }

  /**
   * Load
   * - Load from source (i.e., file system);
   */

  load(module) {

    let _this = this;

    if (moduleJson) {
      _this.options.module     = moduleJson;
      _this.options.modulePath = path.join(_this.S._projectRootPath, 'back', 'modules', _this.options.module, 's-module.json')
    }

    // TODO: Validate module exists in project

    // Defaults
    _this.data                = {};
    _this.data.name           = 'module' + SUtils.generateShortId(6);
    _this.data.version        = '0.0.1';
    _this.data.profile        = 'aws-v' + require('../package.json').version;
    _this.data.location       = 'https://github.com/...';
    _this.data.author         = '';
    _this.data.description    = 'A Serverless Module';
    _this.data.custom         = {};
    _this.data.functions      = {};
    _this.data.cloudFormation = {
      resources: {},
      lambdaIamPolicyDocumentStatements: []
    };

    // If no project path exists, return
    if (!_this.S._projectRootPath || _this.options.module) return;

    let moduleJson = SUtils.readAndParseJsonSync(path.join(_this.S._projectRootPath, 'back', 'modules', _this.options.module, 's-module.json'));

    // Add Functions
    moduleJson.functions  = {};
    let functionList  = fs.readdirSync(path.join(_this.options.modulePath, 'functions'));

    for (let i = 0; i < functionList.length; i++) {

      let func = new ServerlessFunction(_this.S, {
        functionPath: path.join(_this.options.modulePath, 'functions', functionList[i])
      });
      func = func.get();
      moduleJson.functions[func.name] = func;

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

  getResources(stage, region) {
    return this.getPopulate(stage, region).cloudFormation;
  }

  /**
   * getPopulated
   * - Fill in templates then variables
   */

  getPopulated(stage, region) {

    // Required: Stage & Region
    if (!stage || !region) throw new SError('Both "stage" and "region" params are required');

    // Required: Project Path
    if (!this.S._projectRootPath) throw new SError('Project path must be set on Serverless instance');

    // Return
    return SUtils.populate(this.S, this.get(), stage, region);
  }

  /**
   * save
   * - Saves data to file system
   */

  save() {

    let _this = this;

    // loop over functions and save
    Object.keys(this.data.functions).forEach(function(functionName) {

      let func = new ServerlessFunction(_this.S);
      func.data = Object.create(this.data.functions[functionName]);
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

    return;
  }
}

module.exports = ServerlessModule;