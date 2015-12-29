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
    this.load(options.path);
  }

  /**
   * Load
   * - Load from source (i.e., file system);
   */

  load(modulePath) {

    let _this = this;

    // TODO: Validate Module path.  Should consist of Module 'serverless-users' name only.

    // Defaults
    _this._populated          = false;
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

    // If no project path exists, return
    if (!modulePath) return;

    let module = SUtils.readAndParseJsonSync(path.join(
        _this.S._projectRootPath,
        'back',
        'modules',
        modulePath,
        's-module.json'));

    // Add Functions
    module.functions  = {};
    let functionList  = fs.readdirSync(path.join(
        _this.S._projectRootPath,
        'back',
        'modules',
        modulePath,
        'functions'));

    for (let i = 0; i < functionList.length; i++) {

      let funcFile = SUtils.readAndParseJsonSync(path.join(
          _this.S._projectRootPath,
          'back',
          'modules',
          modulePath,
          'functions',
          functionList[i],
          's-function.json'));

      Object.keys(funcFile.functions).forEach(function(funcKey) {
        let func = new ServerlessFunction(_this.S, { path: modulePath + '/' + functionList[i] + '#' + funcKey });
        func = func.get();
        module.functions[func.name] = func;
      });
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
   * Set
   * - Update data
   */

  set(data) {

    // TODO: Validate data

    this.data = data;
  }

  /**
   * Populate
   * - Fill in templates then variables
   */

  populate(stage, region) {

    this._populated = true;

    // this.data includes the already populated functions.
    // So now we're gonna loop through them all again?!
    // We should probably only pass in a module object without the functions.
    // Eitherway, the populate util func. is ready to accept any obj, but it's a matter of efficiency.
    this.data = SUtils.populate(this.data, this.S._projectRootPath, stage, region);
  }
}

module.exports = ServerlessModule;

