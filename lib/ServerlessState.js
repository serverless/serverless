'use strict';

/**
 * Serverless State Class
 */

const SError       = require('./ServerlessError'),
  SUtils           = require('./utils/index'),
  _                = require('lodash'),
  path             = require('path'),
  fs               = require('fs'),
  BbPromise        = require('bluebird');

class ServerlessState {

  /**
   * Constructor
   */

  constructor(Serverless) {
    this.S       = Serverless;
    this.load();
  }

  /**
   * Load
   * - Load from source (i.e., file system);
   */

  load() {
    this.data = {
      meta:     new this.S.classes.Meta(this.S).data,
      project:  new this.S.classes.Project(this.S).data
    }
  }

  /**
   * Set
   * - Set data
   */

  set(data) {
    this.data = _.merge(this.data, data);
  }

  /**
   * Get
   * - Returns clone of data
   */

  get(options) {

    options = options || {};

    // Required: Stage & Region
    if (options.populate && (!options.stage || !options.region)) throw new SError('Both "stage" and "region" params are required if you want get populated project data');

    if (options.populate && options.state && options.region) {
      return {
        meta:    _.cloneDeep(this.data.meta),
        project: _.cloneDeep(SUtils.populate(this.data.meta, this.data.project, options.state, options.region))
      }
    } else {
      return _.cloneDeep(this.data);
    }
  }

  /**
   * Get Resources
   * - get project resources
   */

  getResources(options) {

    options = options || {};

    if (options.populate) {
      return SUtils.getResources(this.get(options.populate, options.state, options.region));
    } else {
      return SUtils.getResources(this.get());
    }
  }

  /**
   * Get Stages
   * - Returns array of stages in project
   */

  getStages() {
    return Object.keys(this.data.meta.stages);
  }

  /**
   * Get Regions (in stage)
   * - Returns array of regions in a stage
   */

  getRegions(stage) {
    return Object.keys(this.data.meta.stages[stage].regions);
  }

  /**
   * Get Components
   * - returns an array of project component objects
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

    for (let i = 0; i < Object.keys(_this.data.project.components).length; i++) {

      let componentName = Object.keys(_this.data.project.components)[i];

      // If paths, and this component is not included, skip
      if (options.paths &&
        options.paths.length &&
        typeof pathsObj[componentName] === 'undefined') continue;

      components.push(_.cloneDeep(_this.data.project.components[componentName]));
    }

    if (options.paths && !components.length) {
      throw new SError('No components found in the paths you provided');
    }

    return components;
  }

  /**
   * Get Modules
   * - returns an array of module instances
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
        let module = path.split('/')[1];

        if (!pathsObj[component])         pathsObj[component] = {};
        if (!pathsObj[component][module]) pathsObj[component][module] = {};
      });
    }

    for (let i = 0; i < Object.keys(_this.data.project.components).length; i++) {

      let component = _this.data.project.components[Object.keys(_this.data.project.components)[i]];

      // If paths, and this component is not included, skip
      if (options.paths &&
        options.paths.length &&
        typeof pathsObj[component.name] === 'undefined') continue;

      for (let j = 0; j < component.modules.length; j++) {

        let module = component.modules[Object.keys(component.modules)[j]];

        // If paths, and this component is not included, skip
        if (options.paths &&
          options.paths.length &&
          typeof pathsObj[component.name][module.name] === 'undefined') continue;

        modules.push(_.cloneDeep(module));
      }
    }

    if (options.paths && !modules.length) {
      throw new SError('No modules found in the paths you provided');
    }

    return modules;
  }

  /**
   * Get Functions
   * - returns an array of function instances
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

    for (let i = 0; i < Object.keys(_this.data.components).length; i++) {

      let component = _this.data.components[Object.keys(_this.data.components)[i]];

      // If paths, and this component is not included, skip
      if (options.paths &&
        options.paths.length &&
        typeof pathsObj[component.name] === 'undefined') continue;

      if (!component.modules) continue;

      for (let j = 0; j < Object.keys(component.modules).length; j++) {

        let module = component.modules[Object.keys(component.modules)[j]];

        // If paths, and this component is not included, skip
        if (options.paths &&
          options.paths.length &&
          typeof pathsObj[component.name][module.name] === 'undefined') continue;

        if (!module.functions) continue;

        for (let k = 0; k < Object.keys(module.functions).length; k++) {

          let func = module.functions[Object.keys(module.functions)[k]];

          // If paths, and this component is not included, skip
          if (options.paths &&
            options.paths.length &&
            typeof pathsObj[component.name][module.name][func.name] === 'undefined') continue;

          functions.push(_.cloneDeep(func));
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

    for (let i = 0; i < Object.keys(_this.data.components).length; i++) {

      let component = _this.data.components[Object.keys(_this.data.components)[i]];

      // If paths, and this component is not included, skip
      if (options.paths &&
        options.paths.length &&
        typeof pathsObj[component.name] === 'undefined') continue;

      if (!component.modules) continue;

      for (let j = 0; j < Object.keys(component.modules).length; j++) {

        let module = component.modules[Object.keys(component.modules)[j]];

        // If paths, and this component is not included, skip
        if (options.paths &&
          options.paths.length &&
          typeof pathsObj[component.name][module.name] === 'undefined') continue;

        if (!module.functions) continue;

        for (let k = 0; k < Object.keys(module.functions).length; k++) {

          let func = module.functions[Object.keys(module.functions)[k]];

          for (let l = 0; l < func.endpoints.length; l++) {

            let endpoint = func.endpoints[l];

            // If paths, and this component is not included, skip
            if (options.paths &&
              options.paths.length &&
              typeof pathsObj[component.name][module.name][func.name][endpoint.path][endpoint.method] === 'undefined') continue;

            endpoints.push(_.cloneDeep(endpoint));
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