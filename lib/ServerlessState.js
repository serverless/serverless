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

    this.S = Serverless;

    // If project path, load state
    if (Serverless.config.projectPath) this.load();
  }

  /**
   * Load
   * - Load from source (i.e., file system);
   */

  load() {
    this.data = {
      meta:     new this.S.classes.Meta(this.S).load(),
      project:  new this.S.classes.Project(this.S).load()
    }
  }

  /**
   * Save
   * - Load from source (i.e., file system);
   */

  save() {
    this.data.project.save({ deep: true });
    this.data.meta.save({ deep: true });
  }

  /**
   * Set
   * - Set data
   */

  set(data) {
    this.data.meta.data    = this.data.meta.set(data.meta);
    this.data.project.data = this.data.project.set(data.meta, { deep: true });
  }

  /**
   * Get
   * - Returns clone of data
   */

  get() {
    return {
      meta:    this.data.meta.get(),
      project: this.data.project.get()
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

    return {
      meta:    this.data.meta.getPopulated(options),
      project: this.data.project.getPopulated(options)
    }
  }

  /**
   * Get Resources
   * - get project resources
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
    return this.data.meta.getStages();
  }

  /**
   * Get Regions (in stage)
   * - Returns array of regions in a stage
   */

  getRegions(stage) {
    return this.data.meta.getRegions(stage);
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

    for (let i = 0; i < Object.keys(_this.data.project.data.components).length; i++) {

      let component = _this.data.project.data.components[Object.keys(_this.data.project.data.components)[i]];

      // If paths, and this component is not included, skip
      if (options.paths &&
        options.paths.length &&
        typeof pathsObj[component.data.name] === 'undefined') continue;

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

    for (let i = 0; i < Object.keys(_this.data.project.data.components).length; i++) {

      let component = _this.data.project.data.components[Object.keys(_this.data.project.data.components)[i]];

      // If paths, and this component is not included, skip
      if (options.paths &&
        options.paths.length &&
        typeof pathsObj[component.data.name] === 'undefined') continue;

      for (let j = 0; j < component.data.modules.length; j++) {

        let module = component.data.modules[Object.keys(component.modules)[j]];

        // If paths, and this component is not included, skip
        if (options.paths &&
          options.paths.length &&
          typeof pathsObj[component.data.name][module.data.name] === 'undefined') continue;

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
        _this.S.validatePath(path, 'function');

        var parsed = _this.S.parsePath(path);

        if (!pathsObj[parsed.component])                pathsObj[parsed.component] = {};
        if (!pathsObj[parsed.component][parsed.module]) pathsObj[parsed.component][parsed.module] = {};
        pathsObj[parsed.component][parsed.module][parsed.function]  = true;
      });
    }

    for (let i = 0; i < Object.keys(_this.data.project.data.components).length; i++) {

      let component = _this.data.project.data.components[Object.keys(_this.data.project.data.components)[i]];

      // If paths, and this component is not included, skip
      if (options.paths &&
        options.paths.length &&
        typeof pathsObj[component.data.name] === 'undefined') continue;

      if (!component.modules) continue;

      for (let j = 0; j < Object.keys(component.data.modules).length; j++) {

        let module = component.data.modules[Object.keys(component.data.modules)[j]];

        // If paths, and this component is not included, skip
        if (options.paths &&
          options.paths.length &&
          typeof pathsObj[component.data.name][module.data.name] === 'undefined') continue;

        if (!module.data.functions) continue;

        for (let k = 0; k < Object.keys(module.data.functions).length; k++) {

          let func = module.data.functions[Object.keys(module.data.functions)[k]];

          // If paths, and this component is not included, skip
          if (options.paths &&
            options.paths.length &&
            typeof pathsObj[component.data.name][module.data.name][func.data.name] === 'undefined') continue;

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
   * getEndpoints
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

        _this.S.validatePath(path, 'endpoint');

        let parsed = _this.S.parsePath(path);

        if (!pathsObj[parsed.component]) pathsObj[parsed.component] = {};
        if (!pathsObj[parsed.component][parsed.module]) pathsObj[parsed.component][parsed.module] = {};
        if (!pathsObj[parsed.component][parsed.module][parsed.function]) pathsObj[parsed.component][parsed.module][parsed.function] = {};
        if (!pathsObj[parsed.component][parsed.module][parsed.function][parsed.urlPath]) pathsObj[parsed.component][parsed.module][parsed.function][parsed.urlPath] = {};
        if (!pathsObj[parsed.component][parsed.module][parsed.function][parsed.urlPath][parsed.urlMethod]) pathsObj[parsed.component][parsed.module][parsed.function][parsed.urlPath][parsed.urlMethod] = true;
      });
    }

    for (let i = 0; i < Object.keys(_this.data.project.data.components).length; i++) {

      let component = _this.data.project.data.components[Object.keys(_this.data.project.data.components)[i]];

      // If paths, and this component is not included, skip
      if (options.paths &&
        options.paths.length &&
        typeof pathsObj[component.data.name] === 'undefined') continue;

      if (!component.data.modules) continue;

      for (let j = 0; j < Object.keys(component.data.modules).length; j++) {

        let module = component.data.modules[Object.keys(component.data.modules)[j]];

        // If paths, and this component is not included, skip
        if (options.paths &&
          options.paths.length &&
          typeof pathsObj[component.data.name][module.data.name] === 'undefined') continue;

        if (!module.data.functions) continue;

        for (let k = 0; k < Object.keys(module.data.functions).length; k++) {

          let func = module.data.functions[Object.keys(module.data.functions)[k]];

          for (let l = 0; l < func.data.endpoints.length; l++) {

            let endpoint = func.data.endpoints[l];

            // If paths, and this component is not included, skip
            if (options.paths &&
              options.paths.length &&
              typeof pathsObj[component.data.name][module.data.name][func.data.name][endpoint.data.path][endpoint.data.method] === 'undefined') continue;

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