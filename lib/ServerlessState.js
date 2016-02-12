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
  }

  /**
   * Load
   * - Load from source (i.e., file system);
   * - Returns promise
   */

  load() {

    let _this  = this;

    return _this._S.getProject().load()
        .then(function() {
          return _this.meta.load();
        });
  }

  /**
   * Save
   * - Load from source (i.e., file system);
   */

  save() {

    let _this = this;

    return _this._S.getProject().save({ deep: true })
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
    this.project = data.project ? this._S.getProject().set(data.project, { deep: true }) : this._S.getProject();
    return this;
  }

  /**
   * Set Asset
   * - Add or replace an asset to the state
   * - Accepts a class instance of: Component, Function, Endpoint
   */

  setAsset(data) {
    if (data instanceof this._S.classes.Component) {
      this._S.getProject().components[data.name] = data;
    } else if (data instanceof this._S.classes.Function) {
      this._S.getProject().components[data._config.sPath.split('/')[0]].functions[data._config.sPath] = data; // XXX
    } else if (data instanceof this._S.classes.Endpoint) {
      let func = this._S.getProject().components[data._config.sPath.split('/')[0]].functions[data._config.sPath.split('@')[0]]; // XXX
      let added = false;
      for (let i = 0; i < func.endpoints.length; i++) {
        if (func.endpoints[i].path === data.path && func.endpoints[i].method === data.method) {
          func.endpoints[i] = data;
          added = true;
        }
      }
      if (!added) func.endpoints.push(data);
    } else {
      return new SError('State.setAsset() failed because you did not submit an instance of a Component, Function or Endpoint class.');
    }
  }

  /**
   * Get
   * - Returns clone of data
   */

  get() {
    return {
      meta:    this.meta.get(),
      project: this._S.getProject().get()
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
      project: this._S.getProject().getPopulated(options)
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
    return this._S.getProject();
  }

  /**
   * Get Resources
   * - Get project resources
   */

  getResources(options) {
    return this._S.getProject().getResources(options);
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