'use strict';

const SError            = require('./Error'),
  BbPromise             = require('bluebird'),
  _                     = require('lodash');

module.exports = function(S) {

  class Stage extends S.classes.Serializer {

    constructor(project, data) {

      super();

      if (!project || !data) throw new SError('Missing required parameters');

      this._class = 'Stage';
      this._project = project;

      // Set Defaults
      this.name = data.name;
      this.regions = {};
      this.variables = new S.classes.Variables(S);

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
            temp[r] = new S.classes.Region(S, this, data.regions[r]);
          }
        }
        delete data.regions;
        this.regions = temp;
      }

      // Variables
      if (data.variables) {
        this.variables = new S.classes.Variables(S, data.variables);
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
      return this._project;
    }

    static validateStage(stageName) {
      return /^[a-zA-Z\d]+$/.test(stageName);
    }
  }

  return Stage;

};
