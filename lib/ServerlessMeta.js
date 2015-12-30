'use strict';

/**
 * Serverless Meta Class
 */

const SError       = require('./ServerlessError'),
  SUtils           = require('./utils/index'),
  SCli             = require('./utils/cli'),
  awsMisc          = require('./utils/aws/Misc'),
  ServerlessModule = require('./ServerlessModule'),
  extend           = require('util')._extend,
  path             = require('path'),
  fs               = require('fs'),
  BbPromise        = require('bluebird');

class ServerlessMeta {

  /**
   * Constructor
   */

  constructor(Serverless, options) {
    this.S = Serverless;
    this.load(this.S._projectRootPath);
  }

  /**
   * Load
   * - Load from source (i.e., file system);
   */

  load(projectPath) {

    let _this = this;

    // Defaults
    _this._populated          = false;
    _this.data                = {};

    // If no project path exists, return
    if (!projectPath) return;

    // Get Project JSON
    let project = SUtils.readAndParseJsonSync(path.join(projectPath, 's-project.json'));

    // Add Modules & Functions
    project.modules = {};
    let moduleList  = fs.readdirSync(path.join(projectPath, 'back', 'modules'));

    for (let i = 0; i < moduleList.length; i++) {
      let module = new ServerlessModule(_this.S, { path: moduleList[i] });
      module = module.get();
      project.modules[module.name] = module;
    }

    _this = extend(_this.data, project);
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

}

module.exports = ServerlessMeta;