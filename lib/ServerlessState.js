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

    this._S      = Serverless;
    this.meta    = new this._S.classes.Meta(this._S);
    this.project = new this._S.classes.Project(this._S);

  }

  /**
   * Load
   * - Load from source (i.e., file system);
   * - Returns promise
   */

  load() {

    let _this  = this;

    return _this.project.load()
      .then(function() {
        console.log(_this.project)
        return _this.meta.load();
      });
  }

  /**
   * Save
   * - Load from source (i.e., file system);
   */

  save() {

    let _this = this;

    return _this.project.save({ deep: true })
      .then(function() {
        return _this.meta.save({ deep: true });
      });
  }

  /**
   * Set
   * - Set data from a javascript object
   */

  set(data) {
    this.meta    = data.meta ? this.meta.set(data.meta) : this.meta;
    this.project = data.project ? this.project.set(data.project, { deep: true }) : this.project;
    return this;
  }

  /**
   * Set Asset
   * - Add or replace an asset to the state
   * - Accepts a class instance of: Project, Component, Module, Function, Endpoint
   */

  setAsset(data) {
    if (data instanceof this._S.classes.Project) {
      this.project = data;
    } else if (data instanceof this._S.classes.Component) {
      this.project.components[data.name] = data;
    } else if (data instanceof this._S.classes.Module) {
      this.project.components[data._config.component].modules[data.name] = data;
    } else if (data instanceof this._S.classes.Function) {
      this.project.components[data._config.component].modules[data._config.module].functions[data.name] = data;
    } else if (data instanceof this._S.classes.Endpoint) {
      let func = this.project.components[data._config.component].modules[data._config.module].functions[data._config.function];
      let added = false;
      for (let i = 0; i < func.endpoints.length; i++) {
        if (func.endpoints[i].path === data.path && func.endpoints[i].method === data.method) {
          func.endpoints[i] = data;
          added = true;
        }
      }
      if (!added) func.endpoints.push(data);
    } else {
      return new SError('State.setAsset() failed because you did not submit an instance of a Project, Component, Module, Function or Endpoint class.');
    }
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

    return {
      meta:    this.meta.get(),
      project: this.project.getPopulated(options)
    }
  }

  /**
   * Get Meta
   * - Returns meta data from state
   */

  getMeta() {
    return this.meta;
  }

  /**
   * Get Project
   * - Returns project data from state
   */

  getProject() {
    return this.project;
  }

  /**
   * Get Resources
   * - Get project resources
   */

  getResources(options) {

    options = options || {};

    if (options.populate) {
      return SUtils.getResources(this.project.getPopulated(options));
    } else {
      return SUtils.getResources(this.project.get());
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
   * - Returns an array of this state's project component instances
   * - Options: component
   * - options.paths is an array of serverless paths like this: ['component', 'component']
   */

  getComponents(options) {

    let _this          = this,
      allComponents    = [],
      foundComponents  = [];

    // Get all
    for (let i = 0; i < Object.keys(_this.project.components).length; i++) {
      allComponents.push(_this.project.components[Object.keys(_this.project.components)[i]]);
    }

    // Return if no options specified
    if (!options) return allComponents;
    if (options && options == { returnPaths: true })  return allComponents.map(function(d) { return d._config.sPath });

    // If options specified, loop through and find the ones specified
    for (let i = 0; i < allComponents.length; i++) {
      let component = allComponents[i];

      if (options.component) {
        if (component._config.component == options.component) {
          foundComponents.push(options.returnPaths ? component._config.sPath : component);
        }
        continue;
      }
      if (options.paths && options.paths.indexOf(component._config.sPath) !== -1) {
        foundComponents.push(component);
        continue;
      }
    }

    return foundComponents;
  }

  /**
   * Get Modules
   * - Returns an array of this state's modules instances
   * - Options: component, module
   * - options.paths is an array of serverless paths like this: ['component/moduleOne', 'component/moduleTwo']
   */

  getModules(options) {

    let _this       = this,
      allModules    = [],
      foundModules  = [];

    // Get all
    for (let i = 0; i < Object.keys(_this.project.components).length; i++) {
      let component = _this.project.components[Object.keys(_this.project.components)[i]];
      if (!component.modules) continue;
      for (let j = 0; j < Object.keys(component.modules).length; j++) {
        allModules.push(component.modules[Object.keys(component.modules)[j]]);
      }
    }

    // Return if no options specified
    if (!options) return allModules;
    if (options && options == { returnPaths: true }) return allModules.map(function(d) { return d._config.sPath });

    // If options specified, loop through and find the ones specified
    for (let i = 0; i < allModules.length; i++) {
      let module = allModules[i];

      if (options.component && options.module) {
        if (module._config.component == options.component && module._config.module == options.module) {
          foundModules.push(options.returnPaths ? module._config.sPath : module);
        }
        continue;
      }
      if (options.component) {
        if (module._config.component == options.component) {
          foundModules.push(options.returnPaths ? module._config.sPath : module);
        }
        continue;
      }
      if (options.paths && options.paths.indexOf(module._config.sPath) !== -1) {
        foundModules.push(module);
        continue;
      }
    }

    return foundModules;
  }

  /**
   * Get Functions
   * - Returns an array of this state's function instances
   * - Options: paths, component, module, function
   * - options.paths is an array of Serverless paths like this: ['component/moduleOne/functionOne', 'component/moduleOne/functionOne']
   */

  getFunctions(options) {

    let _this         = this,
      allFunctions    = [],
      foundFunctions  = [];

    // Get all
    for (let i = 0; i < Object.keys(_this.project.components).length; i++) {
      let component = _this.project.components[Object.keys(_this.project.components)[i]];
      if (!component.modules) continue;
      for (let j = 0; j < Object.keys(component.modules).length; j++) {
        let module = component.modules[Object.keys(component.modules)[j]];
        if (!module.functions) continue;
        for (let k = 0; k < Object.keys(module.functions).length; k++) {
          allFunctions.push(module.functions[Object.keys(module.functions)[k]]);
        }
      }
    }

    // Return if no options specified
    if (!options) return allFunctions;
    if (options && Object.keys(options).length === 1 && options.returnPaths === true) return allFunctions.map(function(d) { return d._config.sPath });

    // If options specified, loop through and find the ones specified
    for (let i = 0; i < allFunctions.length; i++) {
      let func = allFunctions[i];

      if (options.component && options.module && options.function) {
        if (func._config.component == options.component && func._config.module == options.module && func.name == options.function) {
          foundFunctions.push(options.returnPaths ? func._config.sPath : func);
        }
        continue;
      }
      if (options.component && options.module) {
        if (func._config.component == options.component && func._config.module == options.module) {
          foundFunctions.push(options.returnPaths ? func._config.sPath : func);
        }
        continue;
      }
      if (options.component) {
        if (func._config.component == options.component) {
          foundFunctions.push(options.returnPaths ? func._config.sPath : func);
        }
        continue;
      }
      if (options.paths && options.paths.indexOf(func._config.sPath) !== -1) {
        foundFunctions.push(func);
        continue;
      }
    }

    return foundFunctions;
  }

  /**
   * Get Endpoints
   * - Returns an array of this state's function instances
   * - Options: paths, component, module, function, endpointPath, endpointMethod
   * - options.paths is an array of Serverless paths like this: ['component/moduleOne/functionOne@moduleOne/functionOne~GET']
   */

  getEndpoints(options) {

    let _this         = this,
      allEndpoints    = [],
      foundEndpoints  = [];

    // Get all functions
    for (let i = 0; i < Object.keys(_this.project.components).length; i++) {
      let component = _this.project.components[Object.keys(_this.project.components)[i]];
      if (!component.modules) continue;
      for (let j = 0; j < Object.keys(component.modules).length; j++) {
        let module = component.modules[Object.keys(component.modules)[j]];
        if (!module.functions) continue;
        for (let k = 0; k < Object.keys(module.functions).length; k++) {
          let func = module.functions[Object.keys(module.functions)[k]];
          for (let l = 0; l < func.endpoints.length; l++) {
            allEndpoints.push(func.endpoints[l]);
          }
        }
      }
    }

    // Return if no options specified
    if (!options) return allEndpoints;
    if (options && Object.keys(options).length === 1 && options.returnPaths === true) return allEndpoints.map(function(d) { return d._config.sPath });

    // If options specified, loop through functions and find the ones specified
    for (let i = 0; i < allEndpoints.length; i++) {
      let endpoint = allEndpoints[i];

      if (options.component && options.module && options.function && options.endpointPath && options.endpointMethod) {
        if (endpoint._config.component == options.component && endpoint._config.module == options.module && endpoint._config.function == options.function && endpoint.path == options.endpointPath && endpoint.method == options.endpointMethod) {
          foundEndpoints.push(options.returnPaths ? endpoint._config.sPath : endpoint);
        }
        continue;
      }
      if (options.component && options.module && options.function && options.endpointPath && !options.endpointMethod) {
        if (endpoint._config.component == options.component && endpoint._config.module == options.module && endpoint._config.function == options.function && endpoint.path == options.endpointPath) {
          foundEndpoints.push(options.returnPaths ? endpoint._config.sPath : endpoint);
        }
        continue;
      }
      if (options.component && options.module && options.function && options.endpointMethod && !options.endpointPath) {
        if (endpoint._config.component == options.component && endpoint._config.module == options.module && endpoint._config.function == options.function && endpoint.method == options.endpointMethod) {
          foundEndpoints.push(options.returnPaths ? endpoint._config.sPath : endpoint);
        }
        continue;
      }
      if (options.component && options.module && options.function && !options.endpointPath && !options.endpointMethod) {
        if (endpoint._config.component == options.component && endpoint._config.module == options.module && endpoint._config.function == options.function) {
          foundEndpoints.push(options.returnPaths ? endpoint._config.sPath : endpoint);
        }
        continue;
      }
      if (options.component && options.module && options.endpointMethod && !options.function && !options.endpointPath) {
        if (endpoint._config.component == options.component && endpoint._config.module == options.module && endpoint.method == options.endpointMethod) {
          foundEndpoints.push(options.returnPaths ? endpoint._config.sPath : endpoint);
        }
        continue;
      }
      if (options.component && options.module && !options.function && !options.endpointPath && !options.endpointMethod) {
        if (endpoint._config.component == options.component && endpoint._config.module == options.module) {
          foundEndpoints.push(options.returnPaths ? endpoint._config.sPath : endpoint);
        }
        continue;
      }
      if (options.component && options.endpointMethod && !options.module && !options.function && !options.endpointPath) {
        if (endpoint._config.component == options.component && endpoint.method == options.endpointMethod) {
          foundEndpoints.push(options.returnPaths ? endpoint._config.sPath : endpoint);
        }
        continue;
      }
      if (options.component && !options.module && !options.function && !options.endpointPath && !options.endpointMethod) {
        if (endpoint._config.component == options.component) {
          foundEndpoints.push(options.returnPaths ? endpoint._config.sPath : endpoint);
        }
        continue;
      }
      if (options.paths && options.paths.indexOf(endpoint._config.sPath) !== -1) {
        foundEndpoints.push(endpoint);
        continue;
      }
    }

    return foundEndpoints;
  }

  /**
   * Validate Stage Exists
   * - Checks to see if a stage exists in your project
   */

  validateStageExists(stage) {
    return this.meta.validateStageExists(stage);
  }

  /**
   * Validate Region Exists
   * - Checks to see if a stage exists in your project
   */

  validateRegionExists(stage, region) {
    return this.meta.validateRegionExists(stage, region);
  }
}

module.exports = ServerlessState;