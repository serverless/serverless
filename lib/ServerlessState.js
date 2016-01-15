'use strict';

/**
 * Serverless State Class
 */

const SError       = require('./ServerlessError'),
  SUtils           = require('./utils/index'),
  _                = require('lodash'),
  path             = require('path'),
  fs               = require('fs');

class ServerlessState {

  /**
   * Constructor
   */

  constructor(Serverless) {

    this._S = Serverless;

    // If project path, load state
    if (Serverless.config.projectPath) this.load();
  }

  /**
   * Load
   * - Load from source (i.e., file system);
   * - Returns promise
   */

  load() {

    let _this  = this;
    _this.meta = new _this._S.classes.Meta(_this._S);

    return _this.meta.load()
      .then(function() {
        _this.project = new _this._S.classes.Project(_this._S);
        return _this.project.load();
      });
  }

  /**
   * Save
   * - Load from source (i.e., file system);
   */

  save() {

    let _this = this;

    return _this.meta.save({ deep: true })
      .then(function() {
        return _this.project.save({ deep: true });
      });
  }

  /**
   * Set
   * - Set data
   */

  set(data) {
    this.meta    = data.meta ? this.meta.set(data.meta) : this.meta;
    this.project = data.project ? this.project.set(data.project, { deep: true }) : this.project;
    return this;
  }

  /**
   * Get
   * - Returns clone of data
   */

  get() {
    return {
      meta:    this.meta.get(),
      project: this.project.get()
    }
  }

  /**
   * Get Populated
   * - Returns clone of data
   */

  getPopulated(options) {

    options = options || {};

    // Validate: Check Stage & Region
    if (!options.stage || !options.region) throw new SError('Both "stage" and "region" params are required');

    let populatedData = {
      meta:    this.meta.get(),
      project: {}
    };

    return this.project.getPopulated(options)
     .then(function(data) {
       populatedData.project = data;
       return populatedData;
     });
  }

  /**
   * Get Resources
   * - Get project resources
   */

  getResources(options) {

    options = options || {};

    if (options.populate) {
      return SUtils.getResources(this.get(options).project);
    } else {
      return SUtils.getResources(this.get().project);
    }
  }

  /**
   * Get Stages
   * - Returns array of stages in project
   */

  getStages() {
    return this.meta.getStages();
  }

  /**
   * Get Regions (in stage)
   * - Returns array of regions in a stage
   */

  getRegions(stage) {
    return this.meta.getRegions(stage);
  }

  /**
   * Get Components
   * - returns an array of this state's project component instances
   * - options.paths is an array of serverless paths like this: ['component', 'component']
   */

  getComponents(options) {

    let _this    = this,
      pathsObj   = {},
      components = [];

    options = options || {};

    // If paths, create temp obj for easy referencing
    if (options.paths && options.paths.length) {
      options.paths.forEach(function (path) {
        let component = path.split('/')[0];
        if (!pathsObj[component]) pathsObj[component] = {};
      });
    }

    for (let i = 0; i < Object.keys(_this.project.components).length; i++) {

      let component = _this.project.components[Object.keys(_this.project.components)[i]];

      // If paths, and this component is not included, skip
      if (options.paths &&
        options.paths.length &&
        !_.get(pathsObj, component.name, false)) continue;

      components.push(component);
    }

    if (options.paths && !components.length) {
      throw new SError('No components found in the paths you provided');
    }

    return components;
  }

  /**
   * Get Modules
   * - returns an array of this state's modules instances
   * - options.paths is an array of serverless paths like this: ['component/moduleOne', 'component/moduleTwo']
   */

  getModules(options) {

    let _this  = this,
      pathsObj = {},
      modules  = [];

    options = options || {};

    // If paths, create temp obj for easy referencing
    if (options.paths && options.paths.length) {
      options.paths.forEach(function (path) {

        let component = path.split('/')[0];
        let module    = path.split('/')[1];

        if (!pathsObj[component])         pathsObj[component] = {};
        if (!pathsObj[component][module]) pathsObj[component][module] = {};
      });
    }

    for (let i = 0; i < Object.keys(_this.project.components).length; i++) {

      let component = _this.project.components[Object.keys(_this.project.components)[i]];

      // If paths, and this component is not included, skip
      if (options.paths &&
        options.paths.length &&
        !_.get(pathsObj, component.name, false)) continue;

      for (let j = 0; j < Object.keys(component.modules).length; j++) {

        let module = component.modules[Object.keys(component.modules)[j]];

        // If paths, and this component is not included, skip
        if (options.paths &&
          options.paths.length &&
          !_.get(pathsObj, component.name + '.' + module.name, false)) continue;

        modules.push(module);
      }
    }

    if (options.paths && !modules.length) {
      throw new SError('No modules found in the paths you provided');
    }

    return modules;
  }

  /**
   * Get Functions
   * - returns an array of this state's function instances
   * - options.paths is an array of Serverless paths like this: ['component/moduleOne/functionOne', 'component/moduleOne/functionOne']
   */

  getFunctions(options) {

    let _this   = this,
      functions = [],
      pathsObj  = {};

    options     = options || {};

    // If paths, create temp obj for easy referencing
    if (options.paths && options.paths.length) {
      options.paths.forEach(function (path) {

        // Validate Path
        SUtils.validateSPath(_this._S.config.projectPath, path, 'function');

        var parsed = SUtils.parseSPath(path);

        if (!pathsObj[parsed.component])                pathsObj[parsed.component] = {};
        if (!pathsObj[parsed.component][parsed.module]) pathsObj[parsed.component][parsed.module] = {};
        pathsObj[parsed.component][parsed.module][parsed.function]  = true;
      });
    }

    for (let i = 0; i < Object.keys(_this.project.components).length; i++) {

      let component = _this.project.components[Object.keys(_this.project.components)[i]];

      // If paths, and this component is not included, skip
      if (options.paths &&
        options.paths.length &&
        !_.get(pathsObj, component.name, false)) continue;

      if (!component.modules) continue;

      for (let j = 0; j < Object.keys(component.modules).length; j++) {

        let module = component.modules[Object.keys(component.modules)[j]];

        // If paths, and this component is not included, skip
        if (options.paths &&
          options.paths.length &&
          !_.get(pathsObj, component.name + '.' + module.name, false)) continue;

        if (!module.functions) continue;

        for (let k = 0; k < Object.keys(module.functions).length; k++) {

          let func = module.functions[Object.keys(module.functions)[k]];

          // If paths, and this component is not included, skip
          if (options.paths &&
            options.paths.length &&
            !_.get(pathsObj, component.name + '.' + module.name + '.' + func.name, false)) continue;

          functions.push(func);
        }
      }
    }

    if (options.paths && !functions.length) {
      throw new SError('No functions found in the paths you provided');
    }

    return functions;
  }

  /**
   * Get Endpoints
   */

  getEndpoints(options) {

    let _this   = this,
      endpoints = [],
      pathsObj  = {};

    options = options || {};

    // Get Project Data
    let project = options.populate ? _this.getPopulated(options) : _this.get();

    // If paths, create temp obj for easy referencing
    if (options.paths && options.paths.length) {
      options.paths.forEach(function (path) {
        SUtils.validateSPath(_this._S.projectPath, path, 'endpoint');

        let parsed = SUtils.parseSPath(path);

        if (!pathsObj[parsed.component]) pathsObj[parsed.component] = {};
        if (!pathsObj[parsed.component][parsed.module]) pathsObj[parsed.component][parsed.module] = {};
        if (!pathsObj[parsed.component][parsed.module][parsed.function]) pathsObj[parsed.component][parsed.module][parsed.function] = {};
        if (!pathsObj[parsed.component][parsed.module][parsed.function][parsed.urlPath]) pathsObj[parsed.component][parsed.module][parsed.function][parsed.urlPath] = {};
        if (!pathsObj[parsed.component][parsed.module][parsed.function][parsed.urlPath][parsed.urlMethod]) pathsObj[parsed.component][parsed.module][parsed.function][parsed.urlPath][parsed.urlMethod] = true;
      });
    }

    for (let i = 0; i < Object.keys(_this.project.components).length; i++) {

      let component = _this.project.components[Object.keys(_this.project.components)[i]];

      // If paths, and this component is not included, skip
      if (options.paths &&
        options.paths.length &&
        !_.get(pathsObj, component.name, false)) continue;

      if (!component.modules) continue;

      for (let j = 0; j < Object.keys(component.modules).length; j++) {

        let module = component.modules[Object.keys(component.modules)[j]];

        // If paths, and this component is not included, skip
        if (options.paths &&
          options.paths.length &&
          !_.get(pathsObj, component.name + '.' + module.name, false)) continue;

        if (!module.functions) continue;

        for (let k = 0; k < Object.keys(module.functions).length; k++) {

          let func = module.functions[Object.keys(module.functions)[k]];

          for (let l = 0; l < func.endpoints.length; l++) {

            let endpoint = func.endpoints[l];

            // If paths, and this component is not included, skip
            if (options.paths &&
              options.paths.length &&
              !_.get(pathsObj, component.name + '.' + module.name + '.' + func.name + '.' + endpoint.path + '.' + endpoint.method, false)) continue;

            endpoints.push(endpoint);
          }
        }
      }
    }

    if (options.paths && !endpoints.length) {
      throw new SError('No endpoints found in the paths you provided');
    }

    return endpoints;
  }
}

module.exports = ServerlessState;