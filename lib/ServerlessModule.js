'use strict';

/**
 * Serverless Module Class
 * - options.path format is: "moduleFolder"
 */

const SError           = require('./ServerlessError'),
    SUtils             = require('./utils/index'),
    SCli               = require('./utils/cli'),
    awsMisc            = require('./utils/aws/Misc'),
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
    this.S = Serverless;
    this.load(options);
  }

  /**
   * Load
   * - Load from source (i.e., file system);
   */

  load(options) {

    let _this = this;

    // TODO: Validate Module path.  Should consist of Module 'serverless-users' name only.

    // Defaults
    _this._populated          = false;
    _this._projectPath        = options.projectPath;
    _this._modulePath         = options.modulePath;
    _this.data                = {};
    _this.data.name           = 'serverless' + SUtils.generateShortId(6);
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

    // If no module path exists, return
    if (!options.loadJson) return;

    let module = SUtils.readAndParseJsonSync(path.join(
        _this._projectPath,
        'back',
        'modules',
        _this._modulePath,
        's-module.json'));

    // Add Functions
    module.functions  = {};
    let functionList  = fs.readdirSync(path.join(
        _this._projectPath,
        'back',
        'modules',
        _this._modulePath,
        'functions'));

    for (let i = 0; i < functionList.length; i++) {

      let options = {
        projectPath: _this._projectPath,
        functionPath: _this._modulePath + '/functions/' + functionList[i],
        loadJson: true
      };

      let func = new ServerlessFunction(_this.S, options);
      func = func.get();
      module.functions[func.name] = func;

    }

    _this = extend(_this.data, module);
  }

  /**
   * Get
   * - Return data
   */

  get() {
    return this.data;
  }


  /**
   * Populate
   * - Fill in templates then variables
   */

  populate(stage, region) {

    this._populated = true;

    this.data = SUtils.populate(this.data, this.S._projectRootPath, stage, region);
  }

  /**
   * save
   * - saves data to file system
   */
  save() {

    // loop over functions and save
    Object.keys(this.data.functions).forEach(function(functionName) {

      let options = {
        projectPath: _this._projectPath,
        functionPath: _this._modulePath + '/functions/' + functionName,
        loadJson: false
      };

      let func = new ServerlessFunction(_this.S, options);
      func.data = Object.create(this.data.functions[functionName]);
      func.save();

    });

    let moduleJson = SUtils.readAndParseJsonSync(path.join(
      _this._projectPath,
      'back',
      'modules',
      _this._modulePath,
      's-module.json'));

    // clone functions temporarily
    let functionsTemp = Object.create(this.data.functions);

    // temporarily delete functions to compare with JSON
    delete this.data['functions'];

    // check if data changed
    if (_.isEqual(moduleJson, this.data)) {

      // clone back functions property that we deleted
      this.data.functions = Object.create(functionsTemp);
      return;
    }

    // overwrite modules JSON file
    fs.writeFileSync(path.join(_this._projectPath, 'back', 'modules', _this._modulePath, 's-module.json'),
      JSON.stringify(this.data, null, 2));

    this.data.functions = Object.create(functionsTemp);

    return;
  }
}

module.exports = ServerlessModule;

