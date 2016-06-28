'use strict';

const SError            = require('./Error'),
  Serializer            = require('./Serializer'),
  BbPromise             = require('bluebird'),
  _                     = require('lodash');

module.exports = function(S) {

  class Region extends S.classes.Serializer {

    constructor(data, stage) {
      super();

      this._stage = stage;

      if (data) this.fromObject(data);

      this.variables = new S.classes.Variables();
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
      if (data.variables) {
        this.variables = new S.classes.Variables(data.variables);
        delete data.variables;
      }
      return _.assign(this, data);
    }

    getName() {
      return this.name;
    }

    getStage() {
      return this._stage;
    }

    getProject() {
      return S.getProject();
    }

    getVariables() {
      return this.variables;
    }

    setVariables(variables) {
      return this.variables = variables;
    }

    addVariables(variablesObj) {
      return this.getVariables().fromObject(variablesObj);
    }

    static regionNameToVarsFilename(name) {
      return name.replace(/-/g, '');
    }

    static varsFilenameToRegionName(name) {
      if (name.includes('useast1'))      return 'us-east-1';
      if (name.includes('uswest2'))      return 'us-west-2';
      if (name.includes('euwest1'))      return 'eu-west-1';
      if (name.includes('eucentral1'))   return 'eu-central-1';
      if (name.includes('apnortheast1')) return 'ap-northeast-1';
      if (name.includes('apsoutheast2')) return 'ap-southeast-2';
    }
  }

  return Region;
};
