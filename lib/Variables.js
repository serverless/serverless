'use strict';

const path = require('path');
const _ = require('lodash');

module.exports = function (S) {
  class Variables extends S.classes.Serializer {

    constructor(data, filePath) {
      super();

      this._class = 'Variables';
      this._filePath = filePath;

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
      return _.merge(this, data);
    }

    getFilePath() {
      return this._filePath;
    }

    getRootPath() {
      const args = _.toArray(arguments);
      args.unshift(path.dirname(this.getFilePath()));
      return path.join.apply(path, args);
    }
  }

  return Variables;
};
