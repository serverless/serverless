'use strict';

const SError            = require('./Error'),
  fs                    = require('fs'),
  path                  = require('path'),
  _                     = require('lodash'),
  BbPromise             = require('bluebird');

module.exports = function(S) {

  class Templates extends S.classes.Serializer {

    constructor(data, filePath) {
      super();

      this._class = 'Templates';
      this._filePath = filePath;
      this._parents = [];

      if (data) this.fromObject(data);
    }

    load() {
      return this.deserialize(this);
    }

    save() {
      return this.serialize(this);
    }

    /**
     * Set Parents
     * - Parent templates which this template extends
     * - Must be an array of parents sorted left to right from prj root
     */

    setParents(parents) {
      this._parents = parents;
    }

    /**
     * To Object
     * - Aggregates templates w/ any parents and exports clone
     */

    toObject() {
      let clone = S.utils.exportObject(_.cloneDeep(this));
      let parents = _.map(this._parents, (p) => {
        return p.toObject && p.toObject() || {}
      });
      let parentsClone = _.cloneDeep(parents);
      parentsClone.push(clone);
      return _.merge.apply(_, parentsClone);
    }

    fromObject(data) {
      return _.assign(this, data);
    }

    getFilePath() {
      return this._filePath;
    }

    getRootPath() {
      let args = _.toArray(arguments);
      args.unshift(path.dirname(this.getFilePath()));
      return path.join.apply(path, args);
    }
  }

  return Templates;

};
