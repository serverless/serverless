'use strict';

const SError            = require('./Error'),
  BbPromise             = require('bluebird'),
  _                     = require('lodash');

module.exports = function(S) {

  class Stage extends S.classes.Serializer {

    constructor(data) {

      super();
      
      this._class = 'Stage';

      // Set Defaults
      this.name = data.name;
      this.regions = {};
      this.variables = new S.classes.Variables();

      if (data) this.fromObject(data);
    }

    load() {
      return this.deserialize(this);
    }

    save() {
      return this.serialize(this);
    }

    toObject() {
      return S.utils.exportObject(_.cloneDeep(this));
    }

    fromObject(data) {

      // Regions
      if (data.regions) {
        let temp = {};
        for (let r of Object.keys(data.regions)) {
          if (this.regions[r]) {
            temp[r] = this.regions[r].fromObject(data.regions[r]);
          } else {
            temp[r] = new S.classes.Region(data.regions[r], this);
          }
        }
        delete data.regions;
        this.regions = temp;
      }

      // Variables
      if (data.variables) {
        this.variables = new S.classes.Variables(data.variables);
        delete data.variables;
      }

      return _.assign(this, data);
    }

    getName() {
      return this.name;
    }

    getRegion(name) {
      return this.regions[name];
    }

    getAllRegions() {
      let regions = [];
      for (let i = 0; i < Object.keys(this.regions).length; i++) {
        regions.push(this.regions[Object.keys(this.regions)[i]]);
      }
      return regions;
    }

    hasRegion(name) {
      return this.regions[name] != undefined;
    }

    setRegion(region) {
      this.regions[region.getName()] = region;
    }

    removeRegion(region) {
      delete this.regions[region];
    }

    getVariables() {
      return this.variables;
    }

    setVariables(variables) {
      this.variables = variables;
    }

    addVariables(variablesObj) {
      return this.getVariables().fromObject(variablesObj);
    }

    getProject() {
      return S.getProject();
    }

    static validateStage(stageName) {
      return /^[a-zA-Z0-9]+$/.test(stageName);
    }
  }

  return Stage;

};
